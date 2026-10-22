"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Product} from "@/lib/api";
import {PoseSmoother,type FingerName,type HandSide} from "@/lib/handPose";
import {solveCameraRingPose} from "@/lib/cameraRingGeometry";
import {inspectRingGeometry,attachCalibratedRing} from "@/lib/ringCalibration";
import {createFingerOccluder,resizeFingerOccluder} from "@/lib/fingerOcclusion";
import {createHandMeshOccluder,updateHandMeshOccluder,type RemoteHandMesh} from "@/lib/handMeshOcclusion";
import {solveMetricRingFrame} from "@/lib/metricRingFrame";

type Point={x:number;y:number;z:number};
type ServerHand={side:"Left"|"Right";landmarks:Point[];worldLandmarks:Point[];mesh?:RemoteHandMesh};
type ServerResponse={detected:boolean;hands:ServerHand[];inferenceMs:number};
const ENDPOINT=(process.env.NEXT_PUBLIC_WILOR_API_URL||"").replace(/\/$/,"");
const MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

/**
 * Hybrid tracking: MediaPipe provides low-latency camera poses. WiLoR is an
 * asynchronous, rate-limited correction source, never the render clock.
 * WebAR.rocks remains an independently selectable fallback in TryOnSwitcher:
 * its iframe owns a separate camera and cannot safely share landmarks.
 */
export default function WiLoRTryOn({product}:{product:Product}){
 const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const cleanupRef=useRef<()=>void>(()=>{});
 const [running,setRunning]=useState(false),[status,setStatus]=useState("Hybrid tracking: on-device MediaPipe + optional WiLoR corrections.");
 const [finger,setFinger]=useState<FingerName>("ring"),[facing,setFacing]=useState<"user"|"environment">("environment");
 const [fit,setFit]=useState(1),[widthCalibration,setWidthCalibration]=useState(1);
 const [occlusion,setOcclusion]=useState(true),[serverLatency,setServerLatency]=useState<number|null>(null);
 const [meshStatus,setMeshStatus]=useState("Mesh: waiting for WiLoR");
 const stop=useCallback(()=>{cleanupRef.current();cleanupRef.current=()=>{};setRunning(false)},[]);
 useEffect(()=>()=>cleanupRef.current(),[]);
 const start=useCallback(async()=>{
  if(!product.glb_url||product.category!=="ring"){setStatus("A ring GLB model is required.");return}
  const video=videoRef.current,canvas=canvasRef.current;if(!video||!canvas)return;
  stop();setStatus("Opening camera and loading tracking...");
  let stream:MediaStream|null=null,disposed=false;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720},frameRate:{ideal:30}}});
   video.srcObject=stream;await video.play();
   const [{HandLandmarker,FilesetResolver},THREE,{GLTFLoader}]=await Promise.all([
    import("@mediapipe/tasks-vision"),import("three"),import("three/examples/jsm/loaders/GLTFLoader.js")]);
   const vision=await FilesetResolver.forVisionTasks(WASM);
   const tracker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:"GPU"},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minTrackingConfidence:.5});
   const gltf=await new GLTFLoader().loadAsync(product.glb_url);
   if(disposed){tracker.close();return}
   const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,1.7));
   const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,4,8);scene.add(light);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
   const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);camera.position.z=20;
   const anchor=new THREE.Group();anchor.visible=false;scene.add(anchor);
   const calibration=inspectRingGeometry(gltf.scene,{...gltf.scene.userData?.ringCalibration,...product.ring_calibration});
   anchor.add(attachCalibratedRing(gltf.scene,calibration));
   const diameter=Math.max(calibration.innerDiameter,1e-5);
   const occluder=createFingerOccluder(diameter);occluder.visible=false;anchor.add(occluder);
   const smoother=new PoseSmoother();
   const handMesh=createHandMeshOccluder();scene.add(handMesh);
   let meshSnapshot:{mesh:RemoteHandMesh;landmarks:Point[];capturedAt:number}|null=null;
   let latestPoints:Point[]|null=null;
   let latestMetric:{anchorDepth:number;pixelsPerMeter:number}|null=null;
   let lastMeshUpdate=0;
   let lastMeshValid=false;
   const staging=document.createElement("canvas");staging.width=480;staging.height=360;
   const ctx=staging.getContext("2d");
   let raf=0,lastVideoTime=-1,lastTracked=0,lastServerSent=0,serverBusy=false,controller:AbortController|null=null;
   let correction:{dx:number;dy:number;scale:number;time:number}|null=null;
   
   const toScreen=(p:Point)=>{
    const w=canvas.clientWidth,h=canvas.clientHeight,vw=video.videoWidth||w,vh=video.videoHeight||h;
    const s=Math.max(w/vw,h/vh);return {x:p.x*vw*s+(w-vw*s)/2,y:p.y*vh*s+(h-vh*s)/2};
   };
   const solve=(points:Point[],side:HandSide,world?:Point[])=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    return solveCameraRingPose({landmarks:points,finger,toScreen,width:w,height:h,holeDiameter:diameter,
     anchorFraction:product.ring_calibration?.anchorFraction??.52,
     fitMultiplier:fit*(product.scale||1)*(product.ring_calibration?.fitMultiplier??1),
     widthCalibration,reportedSide:side,cameraFacing:facing,
     worldLandmarks:world,previousQuaternion:smoother.ready?smoother.rotation:undefined});
   };
   const sendCorrection=async(points:Point[],side:HandSide,now:number)=>{
    if(!ENDPOINT||!ctx||serverBusy||now-lastServerSent<3500)return;
    serverBusy=true;lastServerSent=now;
    ctx.drawImage(video,0,0,staging.width,staging.height);
    const capturedAt=performance.now();
    const blob=await new Promise<Blob|null>(resolve=>staging.toBlob(resolve,"image/jpeg",.65));
    if(!blob||disposed){serverBusy=false;return}
    const form=new FormData();form.append("frame",blob,"frame.jpg");form.append("include_mesh","true");
    controller=new AbortController();
    const timeout=setTimeout(()=>controller?.abort(),12000);
    try{
     const response=await fetch(ENDPOINT+"/v1/hand-pose",{method:"POST",body:form,signal:controller.signal,cache:"no-store"});
     if(!response.ok)throw new Error("HTTP "+response.status);
     const result=await response.json() as ServerResponse;
     if(disposed)return;
     setServerLatency(result.inferenceMs);
     const hand=result.hands?.[0];
     if(!hand||hand.landmarks?.length!==21){setMeshStatus("Mesh: no hand detected");meshSnapshot=null;return;}
     if(hand.mesh?.available&&hand.mesh.vertices?.length&&hand.mesh.faces?.length){
      meshSnapshot={mesh:hand.mesh,landmarks:hand.landmarks,capturedAt};
      setMeshStatus(`Mesh: ${hand.mesh.vertices.length} vertices / ${hand.mesh.faces.length} faces`);
     }else{
      meshSnapshot=null;
      setMeshStatus("Mesh unavailable: "+((hand.mesh as (RemoteHandMesh & {reason?:string})|undefined)?.reason||"API did not return geometry"));
     }
     // The server result corresponds to the captured frame, not the current frame.
     const localPose=solve(points,side),remotePose=solve(hand.landmarks,hand.side,hand.worldLandmarks);
     if(!localPose||!remotePose)return;
     const dx=remotePose.position.x-localPose.position.x,dy=remotePose.position.y-localPose.position.y;
     const ratio=remotePose.scale/localPose.scale;
     // Never allow a stale or divergent server estimate to throw the ring.
     if(Math.hypot(dx,dy)<18&&ratio>.9&&ratio<1.1){
      correction={dx,dy,scale:ratio,time:performance.now()};
     }
    }catch(e){if(!disposed)console.warn("WiLoR correction unavailable; continuing local tracking",e)}
    finally{clearTimeout(timeout);controller=null;serverBusy=false}
   };
   const tick=(now:number)=>{
    if(disposed)return;
    raf=requestAnimationFrame(tick);
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<1||h<1)return;
    const rw=Math.round(w*renderer.getPixelRatio()),rh=Math.round(h*renderer.getPixelRatio());
    if(canvas.width!==rw||canvas.height!==rh){renderer.setSize(w,h,false);camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix()}
    if(video.readyState>=2&&video.currentTime!==lastVideoTime){
     lastVideoTime=video.currentTime;
     const detection=tracker.detectForVideo(video,now);
     const points=detection.landmarks?.[0] as Point[]|undefined;
     const label=detection.handedness?.[0]?.[0]?.categoryName;
     const side:HandSide=label==="Left"||label==="Right"?label:"Unknown";
     if(points?.length===21){

      latestPoints=points;
      const world=detection.worldLandmarks?.[0] as Point[]|undefined;
      const solved=solve(points,side,world);
      if(solved){
       const position=solved.position.clone(),scale=solved.scale;
       // WiLoR metric camera-space joints provide 3D rotation;
       // live MediaPipe continues to drive 2D translation every frame.
       const metric=meshSnapshot&&now-meshSnapshot.capturedAt<4500&&
        meshSnapshot.landmarks.length===21
        ?solveMetricRingFrame({
         finger,landmarks:meshSnapshot.landmarks,mesh:meshSnapshot.mesh,
         toScreen,width:w,height:h,diameter,fitMultiplier:fit*(product.scale||1),
         anchorFraction:product.ring_calibration?.anchorFraction??.52,
         previous:smoother.ready?smoother.rotation:undefined
        }):null;
       const metricRotation=metric?.quaternion;
       latestMetric=metric?{anchorDepth:metric.anchorDepth,pixelsPerMeter:metric.pixelsPerMeter}:null;
       // Server result only makes small bounded adjustments; decay it rapidly.
       let adjustedScale=scale;
       if(correction){
        const weight=Math.max(0,1-(now-correction.time)/1000)*.06;
        position.x+=correction.dx*weight;position.y+=correction.dy*weight;
        adjustedScale*=1+(correction.scale-1)*weight;
       }
       if(smoother.update(position,metricRotation??solved.quaternion,adjustedScale,now)){
        anchor.position.copy(smoother.position);anchor.quaternion.copy(smoother.rotation);
        anchor.scale.setScalar(smoother.scale);anchor.visible=true;lastTracked=now;
        occluder.visible=occlusion;
        if(occlusion)resizeFingerOccluder(occluder,solved.fingerWidthPx,smoother.scale,diameter);
       }
      }
      void sendCorrection(points,side,now);
     }
    }
    // Allow a brief detector dropout; never tie visibility to slow server calls.
    if(now-lastTracked>850){anchor.visible=false;smoother.reset();latestPoints=null;latestMetric=null;lastMeshValid=false}
    handMesh.visible=false;
    if(occlusion&&anchor.visible&&meshSnapshot&&latestPoints&&now-meshSnapshot.capturedAt<4500){
     const fingerJoint=({index:5,middle:9,ring:13,pinky:17} as const)[finger];
     const valid=now-lastMeshUpdate<65&&lastMeshValid?true:updateHandMeshOccluder({
      mesh:handMesh,remote:meshSnapshot.mesh,remoteLandmarks:meshSnapshot.landmarks,
      liveLandmarks:latestPoints,toScreen,width:w,height:h,fingerJoint,
      ringWidthPx:Math.max(8,smoother.scale*diameter),
      metricDepth:latestMetric??undefined,
     });
     lastMeshValid=valid;
     if(valid){occluder.visible=false;lastMeshUpdate=now;}else handMesh.visible=false;
    }
    renderer.render(scene,camera);
   };
   cleanupRef.current=()=>{
    disposed=true;controller?.abort();cancelAnimationFrame(raf);tracker.close();
    stream?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;
    renderer.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();
     const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
   };
   setRunning(true);setStatus(ENDPOINT?"Hybrid tracking active — MediaPipe + WiLoR corrections":"MediaPipe active — WiLoR endpoint not configured");
   raf=requestAnimationFrame(tick);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());setStatus(e instanceof Error?e.message:"Unable to start camera")}
 },[stop,product,finger,facing,fit,widthCalibration,occlusion]);
 return <section className="tryon-panel">
  <div className="tryon-viewport">
   <video ref={videoRef} autoPlay muted playsInline className={"tryon-video "+(facing==="user"?"mirror":"")}/>
   <canvas ref={canvasRef} className={"tryon-canvas "+(facing==="user"?"mirror":"")}/>
   <div className="tryon-status" role="status">{status}{serverLatency!==null?" · WiLoR "+Math.round(serverLatency)+" ms":""}{" · "+meshStatus}</div>
  </div>
  <div className="tryon-controls">
   <div className="tryon-controlrow">
    <button type="button" className="btn gold" onClick={running?stop:start}>{running?"STOP CAMERA":"START HYBRID TRY-ON →"}</button>
    <button type="button" className="btn ghost" disabled={running} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   <label className="tryon-setting">Finger <select value={finger} disabled={running} onChange={e=>setFinger(e.target.value as FingerName)}>{(["ring","index","middle","pinky"] as const).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label className="tryon-setting">Visual fit <input type="range" min=".6" max="1.5" step=".05" disabled={running} value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <label className="tryon-setting">Finger width <input type="range" min=".75" max="1.35" step=".025" disabled={running} value={widthCalibration} onChange={e=>setWidthCalibration(Number(e.target.value))}/></label>
   <label className="tryon-setting">Finger depth occlusion <input type="checkbox" disabled={running} checked={occlusion} onChange={e=>setOcclusion(e.target.checked)}/></label>
   <p className="tryon-disclaimer">On-device tracking runs continuously; optional compressed frames are sent to WiLoR for bounded corrections. WebAR.rocks remains available as a separate fallback. Stop and restart to apply settings. Visual preview only, not a ring-size measurement.</p>
  </div>
 </section>;
}
