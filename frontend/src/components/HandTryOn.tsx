"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {Product} from "@/lib/api";

type Phase="idle"|"loading"|"active"|"not-found"|"error";
type Category="ring"|"bracelet";
type Point={x:number;y:number;z:number};
const MODEL_BASE="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const SEGMENT_MODEL="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
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
 const [occlusion,setOcclusion]=useState(true);
 const [calibration,setCalibration]=useState(1);
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
   // Segmentation is optional and never blocks the core tracking pipeline.
   // Pixelwise person segmentation is intersected with the tracked finger ROI.
   const maskCanvas=document.createElement("canvas");
   maskCanvas.width=256;maskCanvas.height=256;
   const maskCtx=maskCanvas.getContext("2d",{willReadFrequently:true});
   const maskTexture=new THREE.CanvasTexture(maskCanvas);
   maskTexture.minFilter=THREE.LinearFilter;
   maskTexture.magFilter=THREE.LinearFilter;
   maskTexture.flipY=false;
   let segmenter:import("@mediapipe/tasks-vision").ImageSegmenter|null=null;
   let segmentEnabled=false,segmentLast=0;
   let segmentationReady=false;
   void (async()=>{
     try{
       const {ImageSegmenter}=await import("@mediapipe/tasks-vision");
       const vision=await FilesetResolver.forVisionTasks(WASM_BASE);
       const created=await ImageSegmenter.createFromOptions(vision,{
         baseOptions:{modelAssetPath:SEGMENT_MODEL,delegate:"CPU"},
         runningMode:"VIDEO",outputCategoryMask:true,outputConfidenceMasks:false
       });
       if(generation!==sessionRef.current){created.close();return}
       segmenter=created;segmentEnabled=true;
     }catch(e){console.warn("Optional segmentation unavailable; using geometric occlusion",e)}
   })();
   // The depth-only capsule approximates the proximal phalanx in camera space.
   // Its radius is calibrated per frame; it MUST remain smaller than the ring.
   // This is geometric depth occlusion, not image segmentation.
   const fingerCore=new THREE.Mesh(
     new THREE.CylinderGeometry(.36,.36,1.6,32,1,false),
     new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:THREE.FrontSide})
   );
   const occlusionMat=fingerCore.material as import("three").MeshBasicMaterial;
   occlusionMat.onBeforeCompile=(shader)=>{
     shader.uniforms.handMask={value:maskTexture};
     shader.uniforms.maskEnabled={value:0.0};
     shader.uniforms.screenSize={value:new THREE.Vector2(1,1)};
     shader.fragmentShader="uniform sampler2D handMask;\nuniform float maskEnabled;\nuniform vec2 screenSize;\n"+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace(
       "#include <clipping_planes_fragment>",
       "#include <clipping_planes_fragment>\n if(maskEnabled>0.5){ vec2 xy=gl_FragCoord.xy / screenSize; if(texture2D(handMask,vec2(xy.x,1.0-xy.y)).r<0.45) discard; }"
     );
     (occlusionMat.userData as {shader?:typeof shader}).shader=shader;
   };
   fingerCore.renderOrder=-1;
   anchor.add(fingerCore);
   let raf=0,lastTimestamp=-1,previous=0,seen=0;
   let maskFailure=false;
   const maskImage=document.createElement("canvas");
   maskImage.width=256;maskImage.height=256;

   const poseQuat=new THREE.Quaternion();
   const basis=new THREE.Matrix4();const vx=new THREE.Vector3(),vy=new THREE.Vector3(),vz=new THREE.Vector3();
   const smoothPosition=new THREE.Vector3(),smoothQuaternion=new THREE.Quaternion();let initialized=false;
   let lastPoseTime=0;
   const worldV=(pt:Point)=>new THREE.Vector3(pt.x,-pt.y,-pt.z);
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
     const x=lerp(base.x,tip.x,product.category==="ring"?.22:-.12);
     const y=lerp(base.y,tip.y,product.category==="ring"?.22:-.12);
     const indexBase=toScreen(points[5]),pinkyBase=toScreen(points[17]);
     const palmWidth=Math.hypot(indexBase.x-pinkyBase.x,indexBase.y-pinkyBase.y);
     // Anatomical calibration: palm breadth approximates proximal finger breadth.
     // User-adjustable correction is visual, not an ISO ring-size measurement.
     const fingerWidth=Math.max(11,palmWidth*(product.category==="ring"?.225:.55)*calibration);
     const targetScale=fingerWidth/modelDiameter*fit*(product.scale||1)*1.18;
     const world=(detected.worldLandmarks?.[0]||points) as Point[];
     const a=worldV(world[idx[0]]),b=worldV(world[idx[1]]);
     vy.subVectors(b,a).normalize();
     vx.subVectors(worldV(world[5]),worldV(world[17])).normalize();
     vx.addScaledVector(vy,-vx.dot(vy));
     if(vx.lengthSq()<1e-6){
       vx.set(1,0,0).addScaledVector(vy,-vy.x);
     }
     vx.normalize();
     vz.crossVectors(vx,vy).normalize();
     if(vz.z<0){vx.negate();vz.negate()}
     vx.crossVectors(vy,vz).normalize();
     basis.makeBasis(vx,vy,vz);
     poseQuat.setFromRotationMatrix(basis);
     if(!Number.isFinite(targetScale)||targetScale<=0||!Number.isFinite(poseQuat.w)){
       anchor.visible=false;renderer.render(scene,camera);return;
     }
     const position=new THREE.Vector3(x-w/2,h/2-y,0);
     const seconds=lastPoseTime?Math.min(.1,(time-lastPoseTime)/1000):.033;
     lastPoseTime=time;
     const displacement=initialized?position.distanceTo(smoothPosition):0;
     const positionGain=initialized?Math.min(.82,1-Math.exp(-seconds*(8+displacement*.06))):1;
     const rotationGain=initialized?1-Math.exp(-seconds*10):1;
     const sizeGain=initialized?1-Math.exp(-seconds*7):1;
     smoothPosition.lerp(position,positionGain);
     smoothQuaternion.slerp(poseQuat,rotationGain);
     anchor.position.copy(smoothPosition);
     anchor.quaternion.copy(smoothQuaternion);
     anchor.scale.setScalar(lerp(anchor.scale.x||targetScale,targetScale,sizeGain));
     // Calibrated model-space core: front surface sits behind the front gem.
     // It writes depth only, hiding rear-facing band sections.
     fingerCore.visible=occlusion&&product.category==="ring";
     // Run segmentation at 8 FPS; landmark inference remains at camera cadence.
     if(segmentEnabled&&segmenter&&maskCtx&&time-segmentLast>125){
       segmentLast=time;
       try{
         const result=segmenter.segmentForVideo(video,time);
         const category=result.categoryMask;
         if(category){
           const sw=category.width,sh=category.height;
           const raw=category.getAsUint8Array();
           maskImage.width=sw;maskImage.height=sh;
           const c=maskImage.getContext("2d",{willReadFrequently:true});
           if(c){
             const img=c.createImageData(sw,sh);
             for(let i=0;i<raw.length;i++){const v=raw[i]===1?255:0;const k=i*4;img.data[k]=v;img.data[k+1]=v;img.data[k+2]=v;img.data[k+3]=255}
             c.putImageData(img,0,0);
             maskCtx.clearRect(0,0,256,256);
             // Landmark-aligned ROI limits person segmentation to the tracked hand.
             const vw=video.videoWidth||1,vh=video.videoHeight||1;
             const cover=Math.max(w/vw,h/vh);
             const vwScreen=vw*cover,vhScreen=vh*cover;
             const originX=(w-vwScreen)/2,originY=(h-vhScreen)/2;
             maskCtx.drawImage(maskImage,originX/w*256,originY/h*256,vwScreen/w*256,vhScreen/h*256);
             maskCtx.globalCompositeOperation="destination-in";
             maskCtx.fillStyle="#fff";
             const x1=base.x/w*256,y1=base.y/h*256,x2=tip.x/w*256,y2=tip.y/h*256;
             maskCtx.beginPath();maskCtx.lineCap="round";maskCtx.lineJoin="round";
             maskCtx.moveTo(x1,y1);maskCtx.lineTo(x2,y2);
             maskCtx.lineWidth=Math.max(8,fingerWidth/w*256*1.8);
             maskCtx.stroke();
             maskCtx.globalCompositeOperation="source-over";
             maskTexture.needsUpdate=true;
             segmentationReady=true;
           }
         }
         result.close();
       }catch(err){
         if(!maskFailure){console.warn("Segmentation disabled after runtime error",err);maskFailure=true}
         segmentEnabled=false;segmentationReady=false;
       }
     }
     const shader=(occlusionMat.userData as {shader?:{uniforms:Record<string,{value:unknown}>}}).shader;
     if(shader){
       shader.uniforms.maskEnabled.value=segmentationReady?1.0:0.0;
       (shader.uniforms.screenSize.value as import("three").Vector2).set(canvas.width,canvas.height);
     }
     fingerCore.scale.set(.72,.95,.72);
     fingerCore.position.set(0,0,-.16);
     initialized=true;
     setMessage(prev=>prev==="Hand detected — move slowly to inspect the fit."?prev:"Hand detected — move slowly to inspect the fit.");
     renderer.render(scene,camera);
   };
   cleanRef.current=()=>{
     cancelAnimationFrame(raf);hand.close();segmenter?.close();maskTexture.dispose();renderer.dispose();
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
 },[stop,supported,product.glb_url,product.scale,product.category,facing,finger,fit,occlusion,calibration]);

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
   <label className="tryon-setting">Finger width calibration <input type="range" min=".75" max="1.35" step=".025" value={calibration} onChange={e=>setCalibration(Number(e.target.value))}/><strong>{Math.round(calibration*100)}%</strong></label>
   <label className="tryon-setting">Depth occlusion <input type="checkbox" checked={occlusion} onChange={e=>setOcclusion(e.target.checked)}/></label>
   <p className="tryon-disclaimer">Beta fitting preview: hand landmarks and person-segmentation are processed on your device. Finger masking uses an approximate anatomical model and is not a physical ring-size measurement. For exact fit, consult the jeweler.</p>
   {(facing!=="environment"||finger!=="ring"||fit!==1||calibration!==1)&&phase==="active"&&<p className="tryon-hint">Changed fitting settings? Stop and restart the camera to apply them.</p>}
  </div>
 </section>;
}
