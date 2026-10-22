"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Product} from "@/lib/api";
import {estimateFingerFrame,PoseSmoother,type FingerName} from "@/lib/handPose";
import {solveCameraRingPose} from "@/lib/cameraRingGeometry";
import {inspectRingGeometry,attachCalibratedRing} from "@/lib/ringCalibration";
import {createFingerOccluder,resizeFingerOccluder} from "@/lib/fingerOcclusion";

type Point={x:number;y:number;z:number};
type Hand={side:"Left"|"Right";confidence:number;landmarks:Point[];worldLandmarks:Point[]};
type Response={detected:boolean;hands:Hand[];inferenceMs:number;imageWidth:number;imageHeight:number};
const ENDPOINT=(process.env.NEXT_PUBLIC_WILOR_API_URL||"").replace(/\/$/,"");
const FINGER_JOINTS:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
export default function WiLoRTryOn({product}:{product:Product}){
 const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const stopRef=useRef<()=>void>(()=>{});
 const [status,setStatus]=useState("WiLoR runs on the server; compressed frames leave your device.");
 const [running,setRunning]=useState(false),[finger,setFinger]=useState<FingerName>("ring");
 const [facing,setFacing]=useState<"user"|"environment">("environment");
 const [fit,setFit]=useState(1),[widthCalibration,setWidthCalibration]=useState(1);
 const [latency,setLatency]=useState<number|null>(null);
 const stop=useCallback(()=>{stopRef.current();stopRef.current=()=>{};setRunning(false)},[]);
 useEffect(()=>()=>{stopRef.current()},[]);
 const start=useCallback(async()=>{
  if(!ENDPOINT){setStatus("NEXT_PUBLIC_WILOR_API_URL is not configured.");return}
  if(!product.glb_url||product.category!=="ring"){setStatus("WiLoR currently supports rings with GLB models only.");return}
  const video=videoRef.current,canvas=canvasRef.current;if(!video||!canvas)return;
  stop();setStatus("Opening camera and WiLoR...");
  let stream:MediaStream|null=null;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}}});
   video.srcObject=stream;await video.play();
   const THREE=await import("three");
   const {GLTFLoader}=await import("three/examples/jsm/loaders/GLTFLoader.js");
   const gltf=await new GLTFLoader().loadAsync(product.glb_url);
   const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,1.3));
   const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,4,8);scene.add(light);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
   camera.position.z=20;
   const anchor=new THREE.Group();scene.add(anchor);anchor.visible=false;
   const calibration=inspectRingGeometry(gltf.scene,{...gltf.scene.userData?.ringCalibration,...product.ring_calibration});
   const pivot=attachCalibratedRing(gltf.scene,calibration);anchor.add(pivot);
   const diameter=Math.max(calibration.innerDiameter,1e-5);
   const occluder=createFingerOccluder(diameter);anchor.add(occluder);
   const smoother=new PoseSmoother();
   const staging=document.createElement("canvas");staging.width=480;staging.height=360;
   const ctx=staging.getContext("2d");
   if(!ctx)throw new Error("Canvas capture unavailable");
   let closed=false,raf=0,controller:AbortController|null=null;
   let lastGood=0;
   const toScreen=(p:Point)=>{
    const w=canvas.clientWidth,h=canvas.clientHeight,vw=video.videoWidth||w,vh=video.videoHeight||h;
    const scale=Math.max(w/vw,h/vh),dx=(w-vw*scale)/2,dy=(h-vh*scale)/2;
    return {x:p.x*vw*scale+dx,y:p.y*vh*scale+dy};
   };
   const render=()=>{
    if(closed)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w>0&&h>0){
     const rw=Math.round(w*renderer.getPixelRatio()),rh=Math.round(h*renderer.getPixelRatio());
     if(canvas.width!==rw||canvas.height!==rh){renderer.setSize(w,h,false);camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix()}
     if(lastGood&&performance.now()-lastGood>600)anchor.visible=false;
     renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(render);
   };
   const loop=async()=>{
    while(!closed){
     if(video.readyState<2){await new Promise(r=>setTimeout(r,100));continue}
     ctx.drawImage(video,0,0,staging.width,staging.height);
     const blob=await new Promise<Blob|null>(resolve=>staging.toBlob(resolve,"image/jpeg",.65));
     if(!blob||closed)continue;
     const form=new FormData();form.append("frame",blob,"frame.jpg");
     controller=new AbortController();
     const timeout=setTimeout(()=>controller?.abort(),15000);
     try{
      const response=await fetch(ENDPOINT+"/v1/hand-pose",{method:"POST",body:form,signal:controller.signal,cache:"no-store"});
      if(!response.ok)throw new Error("WiLoR HTTP "+response.status);
      const result=await response.json() as Response;
      if(closed)break;
      setLatency(result.inferenceMs);
      const hand=result.hands?.[0],now=performance.now();
      if(!hand||hand.landmarks.length!==21||hand.worldLandmarks.length!==21){if(!smoother.hold(now))anchor.visible=false;continue}
      const frame=estimateFingerFrame(hand.worldLandmarks,finger,hand.side,smoother.ready?smoother.rotation:undefined);
      if(!frame)continue;
      const w=canvas.clientWidth,h=canvas.clientHeight;
      const solved=solveCameraRingPose({
       landmarks:hand.landmarks,finger,toScreen,width:w,height:h,holeDiameter:diameter,
       anchorFraction:product.ring_calibration?.anchorFraction??.22,
       fitMultiplier:fit*(product.scale||1)*(product.ring_calibration?.fitMultiplier??1),
       widthCalibration,reportedSide:hand.side,cameraFacing:facing,
      });
      if(!solved)continue;
      if(smoother.update(solved.position,solved.quaternion,solved.scale,now)){
       anchor.position.copy(smoother.position);anchor.quaternion.copy(smoother.rotation);anchor.scale.setScalar(smoother.scale);
       const [a,b]=FINGER_JOINTS[finger];const p=toScreen(hand.landmarks[a]),q=toScreen(hand.landmarks[b]);
       resizeFingerOccluder(occluder,solved.fingerWidthPx||Math.hypot(q.x-p.x,q.y-p.y)*.6,smoother.scale,diameter);
       anchor.visible=true;lastGood=now;
       setStatus("WiLoR hand tracking active");
      }
     }catch(err){if(!closed)setStatus(err instanceof Error?err.message:"WiLoR request failed")}
     finally{clearTimeout(timeout);controller=null}
     // A single in-flight request prevents accumulating stale camera frames.
     if(!closed)await new Promise(r=>setTimeout(r,80));
    }
   };
   stopRef.current=()=>{
    closed=true;controller?.abort();cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;
    renderer.dispose();
    scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
   };
   setRunning(true);setStatus("WiLoR initialized; show your hand");
   raf=requestAnimationFrame(render);void loop();
  }catch(err){
   stream?.getTracks().forEach(t=>t.stop());
   setStatus(err instanceof Error?err.message:"Unable to initialize WiLoR");
  }
 },[stop,product,finger,facing,fit,widthCalibration]);
 return <section className="tryon-panel">
  <div className="tryon-viewport">
   <video ref={videoRef} autoPlay muted playsInline className={"tryon-video "+(facing==="user"?"mirror":"")}/>
   <canvas ref={canvasRef} className={"tryon-canvas "+(facing==="user"?"mirror":"")}/>
   <div className="tryon-status" role="status">{status}{latency!==null?" · "+Math.round(latency)+" ms inference":""}</div>
  </div>
  <div className="tryon-controls">
   <div className="tryon-controlrow">
    <button type="button" className="btn gold" onClick={running?stop:start}>{running?"STOP CAMERA":"START WiLoR TRY-ON →"}</button>
    <button type="button" className="btn ghost" disabled={running} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   <label className="tryon-setting">Finger <select value={finger} disabled={running} onChange={e=>setFinger(e.target.value as FingerName)}>{(["ring","index","middle","pinky"] as const).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label className="tryon-setting">Visual fit <input type="range" min=".6" max="1.5" step=".05" disabled={running} value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <label className="tryon-setting">Finger width <input type="range" min=".75" max="1.35" step=".025" disabled={running} value={widthCalibration} onChange={e=>setWidthCalibration(Number(e.target.value))}/></label>
   <p className="tryon-disclaimer">Experimental server inference. Compressed camera frames are transmitted to the configured WiLoR endpoint. This is not a physical ring-size measurement. CPU latency may prevent real-time tracking.</p>
  </div>
 </section>;
}
