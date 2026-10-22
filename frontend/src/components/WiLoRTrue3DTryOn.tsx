"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {HandLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import type {Product} from "@/lib/api";
import type {FingerName,HandSide} from "@/lib/handPose";
import {inspectRingGeometry,attachCalibratedRing} from "@/lib/ringCalibration";
import {UnifiedHandTrack,cameraProjection,type Joint} from "@/lib/unifiedHandTrack";
import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";

type RemoteHand={side:"Left"|"Right";landmarks:Joint[];mesh?:RemoteHandMesh};
type RemoteResult={hands?:RemoteHand[];inferenceMs?:number};
const ENDPOINT=(process.env.NEXT_PUBLIC_WILOR_API_URL||"").replace(/\/$/,"");
const MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
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
  stop();setStatus("Loading hand tracker...");
  let stream:MediaStream|null=null,disposed=false;
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720}},audio:false});
   video.srcObject=stream;await video.play();
   const vision=await FilesetResolver.forVisionTasks(WASM);
   const detector=await HandLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath:MODEL,delegate:"GPU"},runningMode:"VIDEO",numHands:1
   });
   const gltf=await new GLTFLoader().loadAsync(product.glb_url);
   if(disposed){detector.close();return}
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
   let lastVideo=-1,lastRequest=0,lastGood=0,lastLiveSide:HandSide="Unknown";
   let busy=false,raf=0,controller:AbortController|null=null;
   let currentLive:Joint[]|null=null,liveTimestamp=0;
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
    ringPivot.scale.setScalar(physicalDiameter/Math.max(.00001,calibration.innerDiameter));
    updateSize();
   };
   const fetchMesh=async(live:Joint[],side:HandSide,now:number)=>{
    if(busy||!ctx||now-lastRequest<3500)return;
    busy=true;lastRequest=now;
    ctx.drawImage(video,0,0,stage.width,stage.height);
    const captured=performance.now();
    const captureLandmarks=live.map(p=>({...p}));
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
     if(!hand?.mesh){if(!track)setStatus("Waiting for WiLoR MANO mesh");return}
     if(performance.now()-captured>9000||!currentLive||performance.now()-liveTimestamp>350){
      if(!track)setStatus("Waiting for live hand");return;
     }
     // Keep the existing track if it is healthy: asynchronous mesh replacements
     // must not reset ring orientation or shift the ring every 3.5 seconds.
     if(track&&performance.now()-lastGood<750)return;
     const next=new UnifiedHandTrack(hand.mesh,hand.landmarks,finger,hand.side,captured);
     if(!next.update(captureLandmarks,captured)){
      next.dispose();if(!track)setStatus("Waiting for consistent 3D calibration");return;
     }
     if(currentLive&&!next.update(currentLive,performance.now())){
      next.dispose();if(!track)setStatus("Waiting for stable finger pose");return;
     }
     replaceTrack(next);
     setStatus("3D active · MANO "+hand.mesh.vertices.length+" vertices · "+Math.round(data.inferenceMs||0)+" ms");
    }catch(e){if(!disposed&&!track)setStatus("WiLoR: "+(e instanceof Error?e.message:"network error"))}
    finally{busy=false;controller=null}
   };
   const tick=(now:number)=>{
    if(disposed)return;
    raf=requestAnimationFrame(tick);updateSize();
    if(video.readyState>=2&&video.currentTime!==lastVideo){
     lastVideo=video.currentTime;
     const detection=detector.detectForVideo(video,now);
     const points=detection.landmarks?.[0] as Joint[]|undefined;
     const handedness=detection.handedness?.[0]?.[0]?.categoryName;
     const side:HandSide=handedness==="Left"||handedness==="Right"?handedness:"Unknown";
     if(points?.length===21){
      // One hand only; prevent identity swaps while a track is active.
      const sameHand=lastLiveSide==="Unknown"||side==="Unknown"||lastLiveSide===side;
      if(sameHand){
       currentLive=points.map(p=>({...p}));liveTimestamp=now;
       lastLiveSide=side;
       if(track&&track.update(points,now)){
        ringPivot.position.copy(track.ringPosition);
        ringPivot.quaternion.copy(track.ringRotation);
        ringPivot.visible=true;track.occluder.visible=true;
        lastGood=now;
       }
       void fetchMesh(points,side,now);
      }
     }
    }
    if(now-lastGood>450){
     ringPivot.visible=false;
     if(track)track.occluder.visible=false;
     if(now-lastGood>1200)lastLiveSide="Unknown";
    }
    renderer.render(scene,camera);
   };
   cleanup.current=()=>{
    disposed=true;controller?.abort();cancelAnimationFrame(raf);detector.close();
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
   <p className="tryon-disclaimer">Unified camera coordinates, finger-local ring transform, joint-weighted MANO skin deformation and depth-only occlusion. Monocular depth remains an estimate; validate on mobile.</p>
  </div>
 </section>;
}
