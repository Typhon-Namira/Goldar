import * as THREE from "three";
import type {FingerName} from "./handPose";
import type {MeshPoint,RemoteHandMesh} from "./handMeshOcclusion";

const joints:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
const point=(p:MeshPoint,cam:RemoteHandMesh["camera"])=>new THREE.Vector3((p.x*cam.width-cam.cx)*p.z/cam.fx,-(p.y*cam.height-cam.cy)*p.z/cam.fy,-p.z);
const finite=(p:MeshPoint)=>[p.x,p.y,p.z].every(Number.isFinite);

/**
 * Camera-space 3D ring attachment. WiLoR supplies metric camera joints and
 * MANO skin. Live MediaPipe supplies only the fast 2D translation and scale.
 * Depth is relative to the ring center so it can share the overlay's
 * orthographic depth buffer. Never interpret normalized image Z as meters.
 */
export function solveMetricRingFrame(args:{
 finger:FingerName;landmarks:readonly MeshPoint[];
 mesh:RemoteHandMesh;toScreen:(p:MeshPoint)=>{x:number;y:number};
 width:number;height:number;diameter:number;fitMultiplier:number;
 anchorFraction:number;previous?:THREE.Quaternion;
}):{position:THREE.Vector3;quaternion:THREE.Quaternion;scale:number;fingerWidthPx:number;anchorDepth:number;pixelsPerMeter:number}|null{
 const {finger,landmarks,mesh,toScreen,width,height,diameter,fitMultiplier}=args;
 const cam=mesh.camera;
 if(landmarks.length!==21||!landmarks.every(finite)||!mesh.available||!cam||
 !Number.isFinite(cam.fx)||!Number.isFinite(cam.fy)||cam.fx<=0||cam.fy<=0||
 diameter<=0||width<=0||height<=0)return null;
 const [m,p]=joints[finger],t=THREE.MathUtils.clamp(args.anchorFraction,.18,.7);
 const mcp=point(landmarks[m],cam),pip=point(landmarks[p],cam);
 const axis=pip.clone().sub(mcp).normalize();
 const transverse=point(landmarks[5],cam).sub(point(landmarks[17],cam));
 transverse.addScaledVector(axis,-transverse.dot(axis)).normalize();
 if(axis.lengthSq()<.9||transverse.lengthSq()<.9)return null;
 const normal=new THREE.Vector3().crossVectors(transverse,axis).normalize();
 // Resolve outward side from visible MANO skin at the finger's anchor.
 const origin=mcp.clone().lerp(pip,t);
 let outward=normal.clone(),best=0;
 const vertices=mesh.vertices;
 for(const v of vertices){
  if(v.length!==3||!v.every(Number.isFinite))continue;
  const skin=new THREE.Vector3(v[0],-v[1],-v[2]).sub(origin);
  const axial=skin.dot(axis);
  const radial=skin.clone().addScaledVector(axis,-axial);
  if(Math.abs(axial)>.013||radial.lengthSq()<1e-7)continue;
  const projected=new THREE.Vector3(radial.x,radial.y,radial.z);
  // Prefer skin pointing toward the camera (positive Three.js Z).
  if(projected.z>best){best=projected.z;outward.copy(projected.normalize())}
 }
 outward.addScaledVector(axis,-outward.dot(axis)).normalize();
 if(outward.lengthSq()<.9)return null;
 const lateral=new THREE.Vector3().crossVectors(axis,outward).normalize();
 outward.crossVectors(lateral,axis).normalize();
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(lateral,axis,outward)).normalize();
 if(args.previous&&quaternion.dot(args.previous)<0)
  quaternion.set(-quaternion.x,-quaternion.y,-quaternion.z,-quaternion.w);
 const u=(cam.fx*(origin.x)/(-origin.z)+cam.cx)/cam.width;
 const v=(cam.fy*(-origin.y)/(-origin.z)+cam.cy)/cam.height;
 const screen=toScreen({x:u,y:v,z:0});
 if(!Number.isFinite(screen.x)||!Number.isFinite(screen.y))return null;
 const px0=toScreen(landmarks[5]),px1=toScreen(landmarks[17]);
 const palmWidth=Math.hypot(px0.x-px1.x,px0.y-px1.y);
 if(palmWidth<20)return null;
 // Metric ring scale projected through the calibrated WiLoR camera.
 const cameraWidth=cam.fx*(diameter*fitMultiplier)/(-origin.z);
 const screenWidth=toScreen({x:1/cam.width,y:0,z:0}).x-toScreen({x:0,y:0,z:0}).x;
 const fingerWidthPx=Math.abs(cameraWidth*screenWidth);
 const pixelsPerMeter=Math.abs(cam.fx*screenWidth/(-origin.z));
 if(!Number.isFinite(fingerWidthPx)||fingerWidthPx<4||fingerWidthPx>palmWidth*.75)return null;
 return {position:new THREE.Vector3(screen.x-width/2,height/2-screen.y,0),
 quaternion,scale:fingerWidthPx/diameter,fingerWidthPx,anchorDepth:-origin.z,pixelsPerMeter};
}
