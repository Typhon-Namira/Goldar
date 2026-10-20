"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {Product} from "@/lib/api";

type Phase="idle"|"loading"|"active"|"not-found"|"error";
type Category="ring"|"bracelet";
type Point={x:number;y:number;z:number};
const MODEL_BASE="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_BASE="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

export default function HandTryOn({product}:{product:Product}){
 const videoRef=useRef<HTMLVideoElement>(null);
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const cleanRef=useRef<()=>void>(()=>{});
 const sessionRef=useRef(0);
 const [phase,setPhase]=useState<Phase>("idle");
 const [message,setMessage]=useState("Allow camera access to try this piece on your hand.");
 const [facing,setFacing]=useState<"user"|"environment">("environment");
 const [finger,setFinger]=useState<"index"|"middle"|"ring"|"pinky">("ring");
 const [fit,setFit]=useState(1);
 const supported=product.category==="ring"||product.category==="bracelet";
 const stop=useCallback(()=>{
   sessionRef.current+=1;
   cleanRef.current();cleanRef.current=()=>{};
   streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
   if(videoRef.current){videoRef.current.pause();videoRef.current.srcObject=null}
   setPhase("idle");
 },[]);

 const start=useCallback(async()=>{
  stop();
  const generation=sessionRef.current;
  if(!supported){setPhase("error");setMessage("Live hand tracking is not available for this jewelry category.");return}
  if(!product.glb_url){setPhase("error");setMessage("A GLB asset is required for virtual try-on.");return}
  if(!navigator.mediaDevices?.getUserMedia){setPhase("error");setMessage("Camera access requires a supported HTTPS browser.");return}
  const video=videoRef.current,canvas=canvasRef.current;
  if(!video||!canvas)return;
  setPhase("loading");setMessage("Opening camera...");
  try{
   const stream=await navigator.mediaDevices.getUserMedia({
     audio:false,video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720},frameRate:{ideal:30,max:30}}});
   if(generation!==sessionRef.current){stream.getTracks().forEach(t=>t.stop());return}
   streamRef.current=stream;video.srcObject=stream;
   await video.play();
   if(generation!==sessionRef.current)return;
   setMessage("Camera ready — loading hand tracking...");
   const [{HandLandmarker,FilesetResolver},THREE,{GLTFLoader}]=await Promise.all([
     import("@mediapipe/tasks-vision"),import("three"),import("three/examples/jsm/loaders/GLTFLoader.js")]);
   if(generation!==sessionRef.current)return;
   const resolver=await FilesetResolver.forVisionTasks(WASM_BASE);
   if(generation!==sessionRef.current)return;
   const hand=await HandLandmarker.createFromOptions(resolver,{
     baseOptions:{modelAssetPath:MODEL_BASE,delegate:"CPU"},
     runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.65,
     minHandPresenceConfidence:.6,minTrackingConfidence:.6});
   if(generation!==sessionRef.current){hand.close();return}
   setMessage("Hand tracker ready — loading jewelry model...");
   const loaded=await new GLTFLoader().loadAsync(product.glb_url);
   if(generation!==sessionRef.current){hand.close();return}
   const scene=new THREE.Scene();
   scene.add(new THREE.AmbientLight(0xffffff,2.5));
   const light=new THREE.DirectionalLight(0xffefda,3.2);light.position.set(3,6,8);scene.add(light);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"low-power"});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
   camera.position.set(0,0,20);camera.lookAt(0,0,0);
   const anchor=new THREE.Group();scene.add(anchor);
   const model=loaded.scene;
   const bounds=new THREE.Box3().setFromObject(model);
   const size=new THREE.Vector3();bounds.getSize(size);
   const center=new THREE.Vector3();bounds.getCenter(center);
   // Center the asset in its own pivot, not in the rotated parent.
   const modelPivot=new THREE.Group();
   model.position.sub(center);
   modelPivot.add(model);
   const dims=[size.x,size.y,size.z];
   const minAxis=dims.indexOf(Math.min(...dims));
   const holeAxis=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)][minAxis];
   modelPivot.quaternion.setFromUnitVectors(holeAxis,new THREE.Vector3(0,1,0));
   anchor.add(modelPivot);
   const modelDiameter=Math.max(...dims.filter((_,i)=>i!==minAxis),1e-5);
   // Realistic occlusion requires hand depth/segmentation. A conservative
   // depth-only finger core hides only the rear interior, never the entire ring.
   const fingerCore=new THREE.Mesh(
     new THREE.CylinderGeometry(modelDiameter*.20,modelDiameter*.20,modelDiameter*.8,24,1,false),
     new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true})
   );
   fingerCore.renderOrder=-1;
   fingerCore.position.z=-modelDiameter*.07;
   anchor.add(fingerCore);
   let raf=0,lastTimestamp=-1,previous=0,seen=0;
   const poseQuat=new THREE.Quaternion();
   const basis=new THREE.Matrix4();const vx=new THREE.Vector3(),vy=new THREE.Vector3(),vz=new THREE.Vector3();
   const smoothPosition=new THREE.Vector3(),smoothQuaternion=new THREE.Quaternion();let initialized=false;
   const cameraAspect=()=>({w:canvas.clientWidth,h:canvas.clientHeight});
   const toScreen=(pt:Point)=>{
     const {w,h}=cameraAspect();const vw=video.videoWidth||w,vh=video.videoHeight||h;
     const cover=Math.max(w/vw,h/vh);const dx=(w-vw*cover)/2,dy=(h-vh*cover)/2;
     return {x:pt.x*vw*cover+dx,y:pt.y*vh*cover+dy};
   };
   const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
   const fingerBases:{[k:string]:[number,number]}={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
   const tick=(time:number)=>{
     if(generation!==sessionRef.current)return;
     raf=requestAnimationFrame(tick);
     const {w,h}=cameraAspect();
     if(w<1||h<1)return;
     if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio())){
       renderer.setSize(w,h,false);camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();
     }
     if(time-previous<33)return;previous=time;
     if(video.readyState<2)return;
     if(video.currentTime===lastTimestamp)return;lastTimestamp=video.currentTime;
     const detected=hand.detectForVideo(video,time);
     const points=detected.landmarks[0] as Point[]|undefined;
     if(!points||points.length<21){
       if(time-seen>450){anchor.visible=false;setMessage(prev=>prev==="Hand not found — keep your hand in the frame."?prev:"Hand not found — keep your hand in the frame.")}
       renderer.render(scene,camera);return;
     }
     seen=time;anchor.visible=true;
     const idx=product.category==="ring"?fingerBases[finger]:[0,9];
     const base=toScreen(points[idx[0]]),tip=toScreen(points[idx[1]]);
     const dx=tip.x-base.x,dy=tip.y-base.y;
       const x=product.category==="ring"?lerp(base.x,tip.x,.14):lerp(base.x,tip.x,-.12);
     const y=product.category==="ring"?lerp(base.y,tip.y,.14):lerp(base.y,tip.y,-.12);
       const indexBase=toScreen(points[5]),pinkyBase=toScreen(points[17]);
     const palmWidth=Math.hypot(indexBase.x-pinkyBase.x,indexBase.y-pinkyBase.y);
     // The metacarpal span estimates finger diameter more reliably than bone length.
     const fingerWidth=product.category==="ring"?Math.max(13,palmWidth*.235):Math.max(25,palmWidth*.58);
     const targetScale= fingerWidth/modelDiameter*fit*(product.scale||1)*1.22;
     // Build a stable local finger frame in camera coordinates.
     vy.set(dx,-dy,(points[idx[1]].z-points[idx[0]].z)*Math.max(w,h)*.60).normalize();
     vx.set(indexBase.x-pinkyBase.x,pinkyBase.y-indexBase.y,
       (points[5].z-points[17].z)*Math.max(w,h)*.5).normalize();
     vx.addScaledVector(vy,-vx.dot(vy)).normalize();
     if(vx.lengthSq()<.01)vx.set(1,0,0);
     vz.crossVectors(vx,vy).normalize();
     // Keep the front of the ring oriented toward the camera.
     if(vz.z<0){vx.negate();vz.negate()}
     vx.crossVectors(vy,vz).normalize();
     basis.makeBasis(vx,vy,vz);
     poseQuat.setFromRotationMatrix(basis);
     if(!Number.isFinite(targetScale)||!Number.isFinite(poseQuat.x)||!Number.isFinite(poseQuat.y)||!Number.isFinite(poseQuat.z)||!Number.isFinite(poseQuat.w))return;
     const position=new THREE.Vector3(x-w/2,h/2-y,0);
     const motion=Math.hypot(position.x-smoothPosition.x,position.y-smoothPosition.y);
     const positionGain=initialized?Math.min(.78,Math.max(.16,.16+motion*.018)):1;
     const rotationGain=initialized?.30:1;
     smoothPosition.lerp(position,positionGain);
     smoothQuaternion.slerp(poseQuat,rotationGain);
     anchor.position.copy(smoothPosition);
     anchor.quaternion.copy(smoothQuaternion);
     const scaleGain=initialized?.19:1;
     anchor.scale.setScalar(lerp(anchor.scale.x||targetScale,targetScale,scaleGain));
     fingerCore.visible=product.category==="ring";
     initialized=true;
     setMessage(prev=>prev==="Hand detected — move slowly to inspect the fit."?prev:"Hand detected — move slowly to inspect the fit.");
     renderer.render(scene,camera);
   };
   cleanRef.current=()=>{
     cancelAnimationFrame(raf);hand.close();renderer.dispose();
     scene.traverse(o=>{if(o instanceof THREE.Mesh){
       o.geometry?.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];
       materials.forEach(m=>m?.dispose())}});
     anchor.clear();
   };
   setMessage("Ready — show your hand to the camera.");
   setPhase("active");raf=requestAnimationFrame(tick);
  }catch(err){
    if(generation!==sessionRef.current)return;
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
    setPhase("error");
    setMessage(err instanceof Error?err.message:"Unable to start virtual try-on.");
  }
 },[stop,supported,product.glb_url,product.scale,product.category,facing,finger,fit]);

 useEffect(()=>()=>{sessionRef.current++;cleanRef.current();streamRef.current?.getTracks().forEach(t=>t.stop())},[]);
 return <section className="tryon-panel">
  <div className="tryon-viewport">
   <video ref={videoRef} autoPlay muted playsInline className={"tryon-video "+(facing==="user"?"mirror":"")}/>
   <canvas ref={canvasRef} className={"tryon-canvas "+(facing==="user"?"mirror":"")}/>
   {phase!=="active"&&phase!=="loading"&&<div className="tryon-overlay"><span>◇</span><h3 className="serif">Your private fitting room.</h3><p>Camera processing runs on your device.</p></div>}
   <div className="tryon-status" role="status">{message}</div>
  </div>
  <div className="tryon-controls">
   <div className="tryon-controlrow">
    {phase==="active"?<button className="btn" onClick={stop}>STOP CAMERA</button>:<button className="btn gold" disabled={!supported||!product.glb_url} onClick={phase==="loading"?stop:start}>{phase==="loading"?"CANCEL INITIALIZING":"START LIVE TRY-ON →"}</button>}
    <button className="btn ghost" disabled={phase==="loading"} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   {product.category==="ring"&&<label className="tryon-setting">Finger <select value={finger} onChange={e=>setFinger(e.target.value as typeof finger)}><option value="ring">Ring</option><option value="index">Index</option><option value="middle">Middle</option><option value="pinky">Pinky</option></select></label>}
   <label className="tryon-setting">Visual size adjustment <input type="range" min=".6" max="1.5" step=".05" value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <p className="tryon-disclaimer">Experimental hand-tracked preview; not calibrated for physical sizing, ring circumference, depth occlusion or jewelry chain physics. Camera frames are processed locally and are not sent to Goldar servers. For exact fit, consult the jeweler.</p>
   {(facing!=="environment"||finger!=="ring"||fit!==1)&&phase==="active"&&<p className="tryon-hint">Changed fitting settings? Stop and restart the camera to apply them.</p>}
  </div>
 </section>;
}
