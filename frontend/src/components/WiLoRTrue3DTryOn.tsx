"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import * as THREE from "three";

import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import type {Product} from "@/lib/api";
import type {FingerName,HandSide} from "@/lib/handPose";
import {inspectRingGeometry,attachCalibratedRing} from "@/lib/ringCalibration";
import {UnifiedHandTrack,cameraProjection,type Joint} from "@/lib/unifiedHandTrack";
import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";
import {parseManoSnapshot,type ManoSnapshot} from "@/lib/manoSnapshot";
import {skinMano,type ManoRig,type ManoPose} from "@/lib/manoLbs";

type LbsPayload={schemaVersion:number;rig:ManoRig;pose:ManoPose;requiresModelToCameraTransform:boolean};
type RemoteHand={side:"Left"|"Right";landmarks:Joint[];mesh?:RemoteHandMesh;mano?:unknown;manoLbs?:LbsPayload};
type RemoteResult={hands?:RemoteHand[];inferenceMs?:number};
const ENDPOINT=(process.env.NEXT_PUBLIC_WILOR_API_URL||"").replace(/\/$/,"");

export default function WiLoRTrue3DTryOn({product}:{product:Product}){
 const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const cleanup=useRef<()=>void>(()=>{});
 const [running,setRunning]=useState(false);
 const [status,setStatus]=useState("Unified 3D: camera stopped");
 const [finger,setFinger]=useState<FingerName>("ring");
 const [facing,setFacing]=useState<"user"|"environment">("environment");
 const [fit,setFit]=useState(1);
 const stop=useCallback(()=>{cleanup.current();cleanup.current=()=>{};setRunning(false)},[]);
 useEffect(()=>()=>cleanup.current(),[]);
 const start=useCallback(async()=>{
  const video=videoRef.current,canvas=canvasRef.current;
  if(!video||!canvas||!product.glb_url||product.category!=="ring")return;
  if(!ENDPOINT){setStatus("WiLoR endpoint not configured");return}
  stop();setStatus("Starting WiLoR-only tracking...");
  let stream:MediaStream|null=null,disposed=false;
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720}},audio:false});
   video.srcObject=stream;await video.play();
   const gltf=await new GLTFLoader().loadAsync(product.glb_url);
   if(disposed)return
   const calibration=inspectRingGeometry(gltf.scene,{...gltf.scene.userData?.ringCalibration,...product.ring_calibration});
   const ring=attachCalibratedRing(gltf.scene,calibration);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   const camera=new THREE.PerspectiveCamera();camera.position.set(0,0,0);
   const scene=new THREE.Scene();
   scene.add(new THREE.AmbientLight(0xffffff,1.8));
   const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,2,1);scene.add(light);
   const ringPivot=new THREE.Group();ringPivot.add(ring);ringPivot.visible=false;scene.add(ringPivot);
   let track:UnifiedHandTrack|null=null;
   let fittedDiameter=0;
   let latestMano:ManoSnapshot|null=null;
   let lastRequest=0,lastGood=0,lastLiveSide:HandSide="Unknown";
   let lastMeshCapture=0;
   let rejectedUpdates=0;
   let busy=false,raf=0,controller:AbortController|null=null;
   
   const stage=document.createElement("canvas");stage.width=480;stage.height=360;
   const ctx=stage.getContext("2d");
   const updateSize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<=0||h<=0)return;
    const pixelRatio=renderer.getPixelRatio();
    if(canvas.width!==Math.round(w*pixelRatio)||canvas.height!==Math.round(h*pixelRatio))
     renderer.setSize(w,h,false);
    if(track)cameraProjection(camera,track.camera,video.videoWidth,video.videoHeight,w,h);
   };
   const replaceTrack=(next:UnifiedHandTrack)=>{
    if(track){scene.remove(track.occluder);track.dispose()}
    track=next;scene.add(next.occluder);
    const physicalDiameter=next.ringRadius*2*1.06*fit;
    fittedDiameter=physicalDiameter;
    ringPivot.scale.setScalar(physicalDiameter/Math.max(.00001,calibration.innerDiameter));
    updateSize();
   };
   const fetchMesh=async(side:HandSide,now:number)=>{
    // WiLoR alone supplies tracking snapshots; never mix 2D pose providers.
    if(busy||!ctx||now-lastRequest<280)return;
    busy=true;lastRequest=now;
    // Capture the complete camera frame with its native aspect ratio.
    // Preserve the uncropped aspect ratio for WiLoR pixel coordinates.
    const captureWidth=480;
    const captureHeight=Math.max(1,Math.round(captureWidth*video.videoHeight/video.videoWidth));
    if(!Number.isFinite(captureHeight)||!video.videoWidth){busy=false;return}
    if(stage.width!==captureWidth||stage.height!==captureHeight){
     stage.width=captureWidth;stage.height=captureHeight;
    }
    ctx.drawImage(video,0,0,stage.width,stage.height);
    const captured=performance.now();
    try{
     const blob=await new Promise<Blob|null>(resolve=>stage.toBlob(resolve,"image/jpeg",.75));
     if(!blob||disposed)return;
     const form=new FormData();form.append("frame",blob,"hand.jpg");form.append("include_mesh","true");
     controller=new AbortController();
     const abortController=controller;
     const timeout=setTimeout(()=>abortController.abort(),11000);
     let data:RemoteResult;
     try{
      const response=await fetch(ENDPOINT+"/v1/hand-pose",{method:"POST",body:form,signal:abortController.signal});
      if(!response.ok)throw new Error("WiLoR HTTP "+response.status);
      data=await response.json() as RemoteResult;
     }finally{clearTimeout(timeout)}
     if(disposed)return;
     const available=(data.hands||[]).filter(h=>h.mesh?.available&&h.landmarks?.length===21);
     const hand=available.find(h=>h.side===side)||available[0];
     if(hand)lastLiveSide=hand.side;
     if(!hand?.mesh){if(!track)setStatus("Waiting for WiLoR MANO mesh");return}
     if(performance.now()-captured>9000)return;
     // Preserve the current track between asynchronous WiLoR updates.
     if(captured<=lastMeshCapture)return;
     if(track){
      if(track.update(hand.landmarks,performance.now())){
       rejectedUpdates=0;
       ringPivot.position.copy(track.ringPosition);
       ringPivot.quaternion.copy(track.ringRotation);
       ringPivot.visible=true;track.occluder.visible=true;
       lastGood=performance.now();
      }else if(++rejectedUpdates>=3){
       // Reacquire when the hand has moved beyond the original mesh pose.
       scene.remove(track.occluder);track.dispose();track=null;
       rejectedUpdates=0;
       ringPivot.visible=false;
      }else{
       lastMeshCapture=captured;
       return;
      }
      if(track){lastMeshCapture=captured;return;}
     }
     // MANO supplies the anatomical surface at acquisition. The live
     // camera tracker subsequently moves its locked finger-local frame.
     const parsedMano=parseManoSnapshot(hand.mano);
     // Prefer exact 16-joint MANO skinning when a licensed, matching rig is
     // explicitly supplied. Otherwise retain the native WiLoR mesh; never
     // fabricate MANO weights from 21 MediaPipe landmarks.
     let acquisitionMesh=hand.mesh;
     let exactLbs=false;
     const lbs=hand.manoLbs;
     if(lbs?.schemaVersion===1&&lbs.requiresModelToCameraTransform===true&&
        parsedMano?.cameraTranslation?.length===3){
      try{
       const skinned=skinMano(lbs.rig,lbs.pose).vertices;
       const t=parsedMano.cameraTranslation;
       const handedness=hand.side==="Right"?1:-1;
       const cameraVertices=skinned.map(v=>[
        v.x*handedness+t[0],v.y+t[1],v.z+t[2]
       ]);
       if(cameraVertices.every(v=>v.every(Number.isFinite)&&v[2]>0)&&
          cameraVertices.length===hand.mesh.vertices.length){
        // The reconstructed surface must agree with WiLoR's native mesh.
        // Otherwise a mismatched MANO version/side would displace the ring.
        const maxError=cameraVertices.reduce((max,v,i)=>{
         const original=hand.mesh!.vertices[i];
         return Math.max(max,Math.hypot(
          v[0]-original[0],v[1]-original[1],v[2]-original[2]));
        },0);
        if(maxError<.003){
         acquisitionMesh={...hand.mesh,vertices:cameraVertices};
         exactLbs=true;
        }
       }
      }catch{/* Incompatible rig: use native WiLoR mesh safely. */}
     }
     const next=new UnifiedHandTrack(acquisitionMesh,hand.landmarks,finger,hand.side,captured,exactLbs?lbs?.rig:undefined);
     if(!next.update(hand.landmarks,captured)){
      next.dispose();if(!track)setStatus("Waiting for consistent 3D calibration");return;
     }

     if(track){next.dispose();return}
     replaceTrack(next);
     ringPivot.position.copy(next.ringPosition);
     ringPivot.quaternion.copy(next.ringRotation);
     ringPivot.visible=true;
     next.occluder.visible=true;
     lastGood=performance.now();
     lastMeshCapture=captured;
     latestMano=parsedMano;
     setStatus("3D active · "+(exactLbs?"MANO-weighted live tracking":latestMano?"MANO parameters validated":"mesh fallback")+
      " · "+hand.mesh.vertices.length+" vertices · "+Math.round(data.inferenceMs||0)+" ms");
    }catch(e){if(!disposed&&!track)setStatus("WiLoR: "+(e instanceof Error?e.message:"network error"))}
    finally{busy=false;controller=null}
   };
   const tick=(now:number)=>{
    if(disposed)return;
    raf=requestAnimationFrame(tick);updateSize();
    if(video.readyState>=2&&video.videoWidth>0){
     // WiLoR is the sole tracking authority; do not mix MediaPipe poses.
     void fetchMesh(lastLiveSide,now);
     if(track&&track.lastSeen>0&&now-track.lastSeen<700){
      ringPivot.position.copy(track.ringPosition);
      ringPivot.quaternion.copy(track.ringRotation);
      ringPivot.scale.setScalar(fittedDiameter/Math.max(.00001,calibration.innerDiameter));
      ringPivot.visible=true;track.occluder.visible=true;
     }
    }
    if(now-lastGood>1000){
     ringPivot.visible=false;
     if(track)track.occluder.visible=false;
     if(now-lastGood>2500){
      lastLiveSide="Unknown";
      // After tracking loss, reacquire against a fresh mesh instead of
      // using a stale finger frame from an earlier camera viewpoint.
      if(track){scene.remove(track.occluder);track.dispose();track=null}
      lastRequest=0;
     }
    }
    renderer.render(scene,camera);
   };
   cleanup.current=()=>{
    disposed=true;controller?.abort();cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;
    if(track){scene.remove(track.occluder);track.dispose()}
    scene.traverse(o=>{if(o instanceof THREE.Mesh){
     o.geometry.dispose();
     (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
    }});
    renderer.dispose();
   };
   setRunning(true);raf=requestAnimationFrame(tick);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());setStatus(e instanceof Error?e.message:"Camera unavailable")}
 },[product,fit,finger,facing,stop]);
 return <section className="tryon-panel">
  <div className="tryon-viewport">
   <video ref={videoRef} autoPlay muted playsInline className={"tryon-video "+(facing==="user"?"mirror":"")}/>
   <canvas ref={canvasRef} className={"tryon-canvas "+(facing==="user"?"mirror":"")}/>
   <div className="tryon-status" role="status">{status}</div>
  </div>
  <div className="tryon-controls">
   <div className="tryon-controlrow">
    <button type="button" className="btn gold" onClick={running?stop:start}>{running?"STOP CAMERA":"START UNIFIED 3D →"}</button>
    <button type="button" className="btn ghost" disabled={running} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   <label className="tryon-setting">Finger <select disabled={running} value={finger} onChange={e=>setFinger(e.target.value as FingerName)}>{(["ring","index","middle","pinky"] as const).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
   <label className="tryon-setting">Fit <input type="range" min=".85" max="1.25" step=".025" disabled={running} value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <p className="tryon-disclaimer">WiLoR-only pose tracking. No MediaPipe landmarks are mixed into MANO geometry. Network inference cadence limits smoothness; this is not full frame-rate MANO pose fitting or calibrated SLAM.</p>
  </div>
 </section>;
}
