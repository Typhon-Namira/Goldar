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
  setPhase("loading");setMessage("Loading the hand tracking model and jewelry...");
  try{
   const [{HandLandmarker,FilesetResolver},THREE,{GLTFLoader}]=await Promise.all([
     import("@mediapipe/tasks-vision"),import("three"),import("three/examples/jsm/loaders/GLTFLoader.js")]);
   if(generation!==sessionRef.current)return;
   const stream=await navigator.mediaDevices.getUserMedia({
     audio:false,video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720},frameRate:{ideal:30,max:30}}});
   if(generation!==sessionRef.current){stream.getTracks().forEach(t=>t.stop());return}
   streamRef.current=stream;video.srcObject=stream;
   await video.play();
   const resolver=await FilesetResolver.forVisionTasks(WASM_BASE);
   if(generation!==sessionRef.current)return;
   const hand=await HandLandmarker.createFromOptions(resolver,{
     baseOptions:{modelAssetPath:MODEL_BASE,delegate:"CPU"},
     runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.65,
     minHandPresenceConfidence:.6,minTrackingConfidence:.6});
   if(generation!==sessionRef.current){hand.close();return}
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
   model.position.sub(center);
   anchor.add(model);
   const modelDiameter=Math.max(size.x,size.y,size.z,.00001);
   let raf=0,lastTimestamp=-1,previous=0,seen=0;
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
     const len=Math.max(5,Math.hypot(dx,dy));
     const x=product.category==="ring"?lerp(base.x,tip.x,.36):base.x-(tip.x-base.x)*.13;
     const y=product.category==="ring"?lerp(base.y,tip.y,.36):base.y-(tip.y-base.y)*.13;
     const width=product.category==="ring"?len*.95:Math.max(24,len*1.1);
     const targetScale=(width/modelDiameter)*fit*(product.scale||1);
     // Video coordinates are screen coordinates; flip only when mirrored in CSS.
     const targetAngle=Math.atan2(-dy,dx)-Math.PI/2;
     const follow=anchor.userData.initialized?.28:1;
     anchor.position.x=lerp(anchor.position.x,x-w/2,follow);
     anchor.position.y=lerp(anchor.position.y,h/2-y,follow);
     anchor.scale.setScalar(lerp(anchor.scale.x||targetScale,targetScale,follow));
     anchor.rotation.z=lerp(anchor.rotation.z,targetAngle,follow);
     anchor.userData.initialized=true;
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
   {phase!=="active"&&<div className="tryon-overlay"><span>◇</span><h3 className="serif">Your private fitting room.</h3><p>Camera processing runs on your device.</p></div>}
   <div className="tryon-status" role="status">{message}</div>
  </div>
  <div className="tryon-controls">
   <div className="tryon-controlrow">
    {phase==="active"?<button className="btn" onClick={stop}>STOP CAMERA</button>:<button className="btn gold" disabled={phase==="loading"||!supported||!product.glb_url} onClick={start}>{phase==="loading"?"INITIALIZING…":"START LIVE TRY-ON →"}</button>}
    <button className="btn ghost" disabled={phase==="loading"} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   {product.category==="ring"&&<label className="tryon-setting">Finger <select value={finger} onChange={e=>setFinger(e.target.value as typeof finger)}><option value="ring">Ring</option><option value="index">Index</option><option value="middle">Middle</option><option value="pinky">Pinky</option></select></label>}
   <label className="tryon-setting">Visual size adjustment <input type="range" min=".6" max="1.5" step=".05" value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <p className="tryon-disclaimer">Experimental hand-tracked preview; not calibrated for physical sizing, ring circumference, depth occlusion or jewelry chain physics. Camera frames are processed locally and are not sent to Goldar servers. For exact fit, consult the jeweler.</p>
   {(facing!=="environment"||finger!=="ring"||fit!==1)&&phase==="active"&&<p className="tryon-hint">Changed fitting settings? Stop and restart the camera to apply them.</p>}
  </div>
 </section>;
}
