"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {HandLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import type {Product} from "@/lib/api";
import {estimateFingerFrame,type FingerName,type HandSide} from "@/lib/handPose";
import {inspectRingGeometry,attachCalibratedRing} from "@/lib/ringCalibration";
import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";

type P={x:number;y:number;z:number};
type Hand={side:"Left"|"Right";landmarks:P[];mesh?:RemoteHandMesh};
type Result={detected:boolean;hands:Hand[];inferenceMs:number};
const ENDPOINT=(process.env.NEXT_PUBLIC_WILOR_API_URL||"").replace(/\/$/,"");
const MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const FINGERS:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
const finite=(v:number)=>Number.isFinite(v);
const cameraPoint=(p:P,cam:RemoteHandMesh["camera"])=>new THREE.Vector3(
 (p.x*cam.width-cam.cx)*p.z/cam.fx,
 -(p.y*cam.height-cam.cy)*p.z/cam.fy,-p.z
);

/** Calibrated off-axis projection of the actual WiLoR inference image into CSS video cover. */
function projection(camera:THREE.PerspectiveCamera,cam:RemoteHandMesh["camera"],vw:number,vh:number,w:number,h:number){
 const cover=Math.max(w/vw,h/vh),left=(w-vw*cover)/2,top=(h-vh*cover)/2;
 const fx=cam.fx*vw/cam.width*cover,fy=cam.fy*vh/cam.height*cover;
 const cx=cam.cx*vw/cam.width*cover+left,cy=cam.cy*vh/cam.height*cover+top;
 const near=.01,far=20;
 camera.near=near;camera.far=far;
 camera.projectionMatrix.set(2*fx/w,0,1-2*cx/w,0,
  0,2*fy/h,2*cy/h-1,0,
  0,0,-(far+near)/(far-near),-2*far*near/(far-near),
  0,0,-1,0);
 camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
/** Ring and skin share exactly the same metric camera frame and depth buffer. */
function snapshotGeometry(hand:Hand,finger:FingerName,diameter:number,fit:number){
 const mesh=hand.mesh,cam=mesh?.camera;
 if(!mesh?.available||!cam||hand.landmarks.length!==21||mesh.vertices.length<100||mesh.faces.length<100||
 ![cam.fx,cam.fy,cam.width,cam.height].every(v=>finite(v)&&v>0))return null;
 const [m,p]=FINGERS[finger],base=cameraPoint(hand.landmarks[m],cam),tip=cameraPoint(hand.landmarks[p],cam);
 const axis=tip.clone().sub(base);
 if(axis.length()<.008)return null;
 axis.normalize();
 const anchor=base.clone().lerp(tip,.42);
 const across=cameraPoint(hand.landmarks[5],cam).sub(cameraPoint(hand.landmarks[17],cam));
 across.addScaledVector(axis,-across.dot(axis)).normalize();
 if(across.lengthSq()<.8)return null;
 const dorsal=new THREE.Vector3().crossVectors(across,axis).normalize();
 // The MANO vertices are already in camera coordinates, including translation.
 const vertices=mesh.vertices.map(v=>new THREE.Vector3(v[0],-v[1],-v[2]));
 const radiusSamples:number[]=[];
 for(const v of vertices){
  const d=v.clone().sub(anchor),along=d.dot(axis);
  if(Math.abs(along)>.008)continue;
  d.addScaledVector(axis,-along);
  const r=d.length();
  if(r>.003&&r<.025)radiusSamples.push(r);
 }
 radiusSamples.sort((a,b)=>a-b);
 const radius=radiusSamples[Math.floor(radiusSamples.length*.5)];
 if(!finite(radius)||radius<.003||radius>.022)return null;
 // A fixed anatomical dorsal normal: do not flip gemstone toward the camera
 // when the user rotates from the back to the palm.
 const outward=dorsal.multiplyScalar(hand.side==="Right"?1:-1);
 const lateral=new THREE.Vector3().crossVectors(axis,outward).normalize();
 outward.crossVectors(lateral,axis).normalize();
 const quat=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral,axis,outward));
 const geo=new THREE.BufferGeometry();
 const pos=new Float32Array(vertices.length*3);
 vertices.forEach((v,i)=>{pos[3*i]=v.x;pos[3*i+1]=v.y;pos[3*i+2]=v.z});
 const index:number[]=[];
 for(const f of mesh.faces){
  if(f.length!==3||f.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))return null;
  index.push(f[0],f[2],f[1]);
 }
 geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
 geo.setIndex(index);geo.computeVertexNormals();
 const surface=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({
  colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide
 }));
 surface.renderOrder=-10;surface.frustumCulled=false;
 const physicalDiameter=radius*2*1.06*fit;
 const ringScale=physicalDiameter/diameter;
 if(!finite(ringScale)||ringScale<=0)return null;
 return {surface,anchor,quat,ringScale,cam};
}
export default function WiLoRTrue3DTryOn({product}:{product:Product}){
 const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const cleanup=useRef<()=>void>(()=>{});
 const [running,setRunning]=useState(false),[status,setStatus]=useState("True 3D: awaiting camera");
 const [finger,setFinger]=useState<FingerName>("ring");
 const [facing,setFacing]=useState<"environment"|"user">("environment");
 const [fit,setFit]=useState(1);
 const stop=useCallback(()=>{cleanup.current();cleanup.current=()=>{};setRunning(false)},[]);
 useEffect(()=>()=>cleanup.current(),[]);
 const start=useCallback(async()=>{
  const video=videoRef.current,canvas=canvasRef.current;
  if(!video||!canvas||!product.glb_url||product.category!=="ring")return;
  if(!ENDPOINT){setStatus("WiLoR endpoint is not configured");return}
  stop();setStatus("Loading 3D tracking...");
  let stream:MediaStream|null=null,disposed=false;
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720}},audio:false});
   video.srcObject=stream;await video.play();
   const vision=await FilesetResolver.forVisionTasks(WASM);
   const tracker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:"GPU"},runningMode:"VIDEO",numHands:1});
   const gltf=await new GLTFLoader().loadAsync(product.glb_url);
   if(disposed){tracker.close();return}
   const calibration=inspectRingGeometry(gltf.scene,{...gltf.scene.userData?.ringCalibration,...product.ring_calibration});
   const diameter=calibration.innerDiameter;
   const ring=attachCalibratedRing(gltf.scene,calibration);
   const scene=new THREE.Scene();
   scene.add(new THREE.AmbientLight(0xffffff,1.8));
   const lamp=new THREE.DirectionalLight(0xffffff,2);lamp.position.set(1,2,1);scene.add(lamp);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   const camera=new THREE.PerspectiveCamera();camera.position.set(0,0,0);
   const root=new THREE.Group();scene.add(root);
   const ringPivot=new THREE.Group();ringPivot.add(ring);root.add(ringPivot);
   root.visible=false;
   let surface:THREE.Mesh|null=null,cam:RemoteHandMesh["camera"]|null=null;
   let captureFrame:ReturnType<typeof estimateFingerFrame>=null;
   let captureDepth=0;
   let capturePalm=0,poseTime=0;
   let lastAcceptedCapture=0;
   let liveFrame:ReturnType<typeof estimateFingerFrame>=null;
   let livePoints:P[]|null=null;
   let liveSide:HandSide="Unknown";
   let lastVideo=-1,lastRequest=0,busy=false,raf=0,controller:AbortController|null=null;
   const staging=document.createElement("canvas");staging.width=480;staging.height=360;
   const ctx=staging.getContext("2d");
   const updateSize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<1||h<1)return;
    const ratio=renderer.getPixelRatio();
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio))renderer.setSize(w,h,false);
    if(cam)projection(camera,cam,video.videoWidth,video.videoHeight,w,h);
   };
   const request=async(world:P[],landmarks:P[],side:HandSide,now:number)=>{
    if(!ctx||busy||now-lastRequest<3500)return;
    busy=true;lastRequest=now;
    ctx.drawImage(video,0,0,480,360);
    const captureWorld=world.map(p=>({...p}));
    const captureLandmarks=landmarks.map(p=>({...p}));
    const capturedAt=performance.now();
    try{
     const blob=await new Promise<Blob|null>(resolve=>staging.toBlob(resolve,"image/jpeg",.7));
     if(!blob||disposed)return;
     const form=new FormData();form.append("frame",blob,"frame.jpg");form.append("include_mesh","true");
     controller=new AbortController();
     const timeout=setTimeout(()=>controller?.abort(),11000);
     let result:Result;
     try{
      const response=await fetch(ENDPOINT+"/v1/hand-pose",{method:"POST",body:form,signal:controller.signal});
      if(!response.ok)throw new Error("WiLoR HTTP "+response.status);
      result=await response.json() as Result;
     }finally{clearTimeout(timeout)}
     if(disposed)return;
     const hand=result.hands?.[0];
     if(!hand||hand.side!==side||!hand.mesh?.available){setStatus("3D mesh unavailable; waiting");return}
     const snap=snapshotGeometry(hand,finger,diameter,fit*(product.scale||1));
     const frame=estimateFingerFrame(captureWorld,finger,side);
     const palm=Math.hypot(captureLandmarks[5].x-captureLandmarks[17].x,captureLandmarks[5].y-captureLandmarks[17].y);
     if(!snap||!frame||frame.confidence<.35||palm<.03)return;
     if(capturedAt<=lastAcceptedCapture||performance.now()-capturedAt>5500||liveSide!==side||!liveFrame||!livePoints||liveFrame.quaternion.angleTo(frame.quaternion)>1){snap.surface.geometry.dispose();(snap.surface.material as THREE.Material).dispose();return;}
     lastAcceptedCapture=capturedAt;
     if(surface){root.remove(surface);surface.geometry.dispose();(surface.material as THREE.Material).dispose()}
     surface=snap.surface;root.add(surface);
     ringPivot.position.copy(snap.anchor);
     ringPivot.quaternion.copy(snap.quat);
     ringPivot.scale.setScalar(snap.ringScale);
     cam=snap.cam;captureFrame=frame;capturePalm=palm;
     captureDepth=-snap.anchor.z;poseTime=performance.now();
     root.quaternion.copy(liveFrame.quaternion).multiply(frame.quaternion.clone().invert());
     const live=livePoints;
     const [jm,jp]=FINGERS[finger];
     const centerX=live[jm].x*.58+live[jp].x*.42;
     const centerY=live[jm].y*.58+live[jp].y*.42;
     const w=canvas.clientWidth,h=canvas.clientHeight;
     const cover=Math.max(w/video.videoWidth,h/video.videoHeight);
     const px=centerX*video.videoWidth*cover+(w-video.videoWidth*cover)/2;
     const py=centerY*video.videoHeight*cover+(h-video.videoHeight*cover)/2;
     const fx=cam.fx*video.videoWidth/cam.width*cover;
     const fy=cam.fy*video.videoHeight/cam.height*cover;
     const cx=cam.cx*video.videoWidth/cam.width*cover+(w-video.videoWidth*cover)/2;
     const cy=cam.cy*video.videoHeight/cam.height*cover+(h-video.videoHeight*cover)/2;
     const depth=captureDepth;
     const target=new THREE.Vector3((px-cx)*depth/fx,-(py-cy)*depth/fy,-depth);
     root.position.copy(target.sub(ringPivot.position.clone().applyQuaternion(root.quaternion)));
     root.visible=true;
     updateSize();
     setStatus("3D MANO active · "+hand.mesh.vertices.length+" vertices · WiLoR "+Math.round(result.inferenceMs)+" ms");
    }catch(e){if(!disposed)setStatus("WiLoR waiting: "+(e instanceof Error?e.message:"network error"))}
    finally{busy=false;controller=null}
   };
   const tick=(now:number)=>{
    if(disposed)return;
    raf=requestAnimationFrame(tick);updateSize();
    if(video.readyState>=2&&video.currentTime!==lastVideo){
     lastVideo=video.currentTime;
     const detection=tracker.detectForVideo(video,now);
     const points=detection.landmarks?.[0] as P[]|undefined;
     const world=detection.worldLandmarks?.[0] as P[]|undefined;
     const label=detection.handedness?.[0]?.[0]?.categoryName;
     const side:HandSide=label==="Left"||label==="Right"?label:"Unknown";
     if(points?.length===21&&world?.length===21){
      const frame=estimateFingerFrame(world,finger,side);
      if(frame&&frame.confidence>.35){liveFrame=frame;livePoints=points.map(p=>({...p}));liveSide=side;}
      if(root.visible&&captureFrame&&cam&&frame&&frame.confidence>.35){
       // Rotate the entire reconstructed hand and the attached ring together.
       const delta=frame.quaternion.clone().multiply(captureFrame.quaternion.clone().invert());
       root.quaternion.slerp(delta,root.quaternion.angleTo(delta)>.7?.22:.38);
       const [m,p]=FINGERS[finger];
       const center={x:points[m].x*.58+points[p].x*.42,y:points[m].y*.58+points[p].y*.42};
       const palm=Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y);
       const depth=THREE.MathUtils.clamp(captureDepth*capturePalm/Math.max(palm,.01),captureDepth*.65,captureDepth*1.5);
       const w=canvas.clientWidth,h=canvas.clientHeight;
       const cover=Math.max(w/video.videoWidth,h/video.videoHeight);
       const x=(center.x*video.videoWidth*cover+(w-video.videoWidth*cover)/2);
       const y=(center.y*video.videoHeight*cover+(h-video.videoHeight*cover)/2);
       const fx=cam.fx*video.videoWidth/cam.width*cover;
       const fy=cam.fy*video.videoHeight/cam.height*cover;
       const cx=cam.cx*video.videoWidth/cam.width*cover+(w-video.videoWidth*cover)/2;
       const cy=cam.cy*video.videoHeight/cam.height*cover+(h-video.videoHeight*cover)/2;
       const desired=new THREE.Vector3((x-cx)*depth/fx,-(y-cy)*depth/fy,-depth);
       const current=ringPivot.position.clone().applyQuaternion(root.quaternion);
       const shift=desired.sub(current);
       root.position.lerp(shift,.38);
       poseTime=now;
      }
      void request(world,points,side,now);
     }
    }
    if(now-poseTime>1600)root.visible=false;
    renderer.render(scene,camera);
   };
   cleanup.current=()=>{
    disposed=true;controller?.abort();cancelAnimationFrame(raf);tracker.close();
    stream?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;
    renderer.dispose();
    scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();
     const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
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
    <button type="button" className="btn gold" onClick={running?stop:start}>{running?"STOP CAMERA":"START TRUE 3D →"}</button>
    <button type="button" className="btn ghost" disabled={running} onClick={()=>setFacing(v=>v==="user"?"environment":"user")}>CAMERA: {facing==="user"?"FRONT":"REAR"}</button>
   </div>
   <label className="tryon-setting">Finger <select value={finger} disabled={running} onChange={e=>setFinger(e.target.value as FingerName)}>{(["ring","index","middle","pinky"] as const).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label className="tryon-setting">Fit <input type="range" min=".85" max="1.25" step=".025" disabled={running} value={fit} onChange={e=>setFit(Number(e.target.value))}/><strong>{Math.round(fit*100)}%</strong></label>
   <p className="tryon-disclaimer">Perspective camera and metric MANO depth. WiLoR CPU inference is asynchronous; fast movement and finger articulation still require validation. Visual preview only.</p>
  </div>
 </section>;
}
