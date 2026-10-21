import * as THREE from "three";

export type HandPoint={x:number;y:number;z:number};
export type FingerName="index"|"middle"|"ring"|"pinky";
export type HandSide="Left"|"Right"|"Unknown";
export type PalmView="palm"|"back"|"edge"|"unknown";
export type PoseResult={quaternion:THREE.Quaternion;handSide:HandSide;view:PalmView;confidence:number};
const segments:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
const finite=(v:THREE.Vector3)=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const v=(p:HandPoint)=>new THREE.Vector3(p.x,-p.y,-p.z);

// World landmarks define relative finger orientation. They are not camera-metric positions.
export function estimateFingerPose(
 points:readonly HandPoint[],finger:FingerName,reportedSide:HandSide="Unknown",
 previous?:THREE.Quaternion,
):PoseResult|null{
 if(points.length<21)return null;
 const [mcp,pip]=segments[finger];
 const axis=v(points[pip]).sub(v(points[mcp]));
 if(!finite(axis)||axis.lengthSq()<1e-8)return null;
 axis.normalize();
 const across=v(points[5]).sub(v(points[17]));
 const palmNormal=new THREE.Vector3().crossVectors(
  v(points[5]).sub(v(points[0])),
  v(points[17]).sub(v(points[0])),
 );
 if(!finite(palmNormal)||palmNormal.lengthSq()<1e-9)return null;
 palmNormal.normalize();
 across.addScaledVector(axis,-across.dot(axis));
 if(across.lengthSq()<1e-8)return null;
 across.normalize();
 const normal=new THREE.Vector3().crossVectors(across,axis).normalize();
 if(!finite(normal))return null;
 // A screen-facing normal and the MCP-based palm normal are *relative*
 // orientations, not metric surface normals. Do not flip a ring to force front-facing.
 const facing=palmNormal.z;
 const view:PalmView=Math.abs(facing)<.18?"edge":(
  (reportedSide==="Right"?facing:-facing)>0?"palm":"back"
 );
 const matrix=new THREE.Matrix4().makeBasis(across,axis,normal);
 const q=new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
 // Quaternion sign has no geometric effect, but affects temporal interpolation.
 if(previous&&q.dot(previous)<0)q.set(-q.x,-q.y,-q.z,-q.w);
 return {quaternion:q,handSide:reportedSide,view,confidence:Math.min(1,Math.abs(facing))};
}

export class PoseSmoother{
 readonly position=new THREE.Vector3();
 readonly rotation=new THREE.Quaternion();
 scale=1;
 ready=false;
 lastTime=0;
 reset(){this.ready=false;this.lastTime=0;this.scale=1;this.position.set(0,0,0);this.rotation.identity()}
 update(position:THREE.Vector3,rotation:THREE.Quaternion,scale:number,time:number):boolean{
  if(!finite(position)||!Number.isFinite(scale)||scale<=0||!Number.isFinite(rotation.w))return false;
  if(!this.ready){this.position.copy(position);this.rotation.copy(rotation);this.scale=scale;this.ready=true;this.lastTime=time;return true}
  const dt=Math.max(0.001,Math.min(.1,(time-this.lastTime)/1000));this.lastTime=time;
  const distance=this.position.distanceTo(position);
  // Reject impossible one-frame jumps rather than propagating corrupted landmarks.
  if(distance>220){this.reset();return false}
  const moving=Math.min(1,distance/38);
  const posAlpha=1-Math.exp(-dt*(7+moving*16));
  const rotAlpha=1-Math.exp(-dt*(8+moving*10));
  const scaleAlpha=1-Math.exp(-dt*6);
  this.position.lerp(position,posAlpha);
  this.rotation.slerp(rotation,rotAlpha);
  this.scale+= (scale-this.scale)*scaleAlpha;
  return true;
 }
}
