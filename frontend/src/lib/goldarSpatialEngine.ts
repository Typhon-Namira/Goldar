import * as THREE from "three";
import type {FingerName,HandSide} from "@/lib/handPose";
import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";
import type {ManoSnapshot} from "@/lib/manoSnapshot";
import {cameraProjection,type Joint} from "@/lib/unifiedHandTrack";

/**
 * Goldar Spatial Engine v2: one WiLoR camera-space authority.
 * No MediaPipe and no inverse-distance skin deformation. Each accepted
 * snapshot supplies an entire posed MANO mesh. The attachment is a stable
 * proximal-finger anatomical frame and is filtered in timestamp order.
 */
export type SpatialObservation={
 mesh:RemoteHandMesh;landmarks:Joint[];mano:ManoSnapshot|null;
 side:HandSide;capturedAt:number;receivedAt:number;
};
const BONES:Record<FingerName,[number,number]>={
 index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]
};
const valid=(n:number)=>Number.isFinite(n);
const lift=(p:Joint,c:RemoteHandMesh["camera"])=>new THREE.Vector3(
 (p.x*c.width-c.cx)*p.z/c.fx,
 -(p.y*c.height-c.cy)*p.z/c.fy,-p.z
);
const copyCameraMesh=(mesh:RemoteHandMesh):THREE.BufferGeometry=>{
 const vertices=new Float32Array(mesh.vertices.length*3);
 mesh.vertices.forEach((v,i)=>{
  vertices[i*3]=v[0];vertices[i*3+1]=-v[1];vertices[i*3+2]=-v[2];
 });
 const faces=mesh.faces.flatMap(f=>[f[0],f[2],f[1]]);
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.BufferAttribute(vertices,3));
 g.setIndex(faces);g.computeBoundingSphere();return g;
};
const basis=(points:THREE.Vector3[],finger:FingerName)=>{
 const [a,b]=BONES[finger];
 const axis=points[b].clone().sub(points[a]);
 const across=points[5].clone().sub(points[17]);
 if(axis.lengthSq()<.000025||across.lengthSq()<.000025)return null;
 axis.normalize();across.addScaledVector(axis,-across.dot(axis));
 if(across.lengthSq()<.000025)return null;
 across.normalize();
 const normal=new THREE.Vector3().crossVectors(across,axis).normalize();
 const lateral=new THREE.Vector3().crossVectors(axis,normal).normalize();
 const q=new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(lateral,axis,normal));
 return {position:points[a].clone().lerp(points[b],.38),rotation:q,axis};
};
export class GoldarSpatialEngine{
 readonly occluder:THREE.Mesh;
 readonly position=new THREE.Vector3();
 readonly rotation=new THREE.Quaternion();
 readonly finger:FingerName;
 readonly camera:RemoteHandMesh["camera"];
 readonly side:HandSide;
 readonly diameter:number;
 lastCapture=0;
 lastReceived=0;
 private initialized=false;
 constructor(first:SpatialObservation,finger:FingerName){
  this.finger=finger;this.camera=first.mesh.camera;this.side=first.side;
  if(!this.acceptable(first))throw new Error("Invalid WiLoR spatial observation");
  const joints=first.landmarks.map(p=>lift(p,this.camera));
  const frame=basis(joints,finger);
  if(!frame)throw new Error("Cannot resolve proximal finger frame");
  const vertices=first.mesh.vertices.map(v=>new THREE.Vector3(v[0],-v[1],-v[2]));
  const radii=vertices.flatMap(v=>{
   const d=v.clone().sub(frame.position),along=d.dot(frame.axis);
   if(Math.abs(along)>.0045)return [];
   const r=d.addScaledVector(frame.axis,-along).length();
   return r>.004&&r<.015?[r]:[];
  }).sort((a,b)=>a-b);
  const radius=THREE.MathUtils.clamp(radii.length>=8?
   radii[Math.floor(radii.length*.35)]:.009,.0065,.0125);
  this.diameter=radius*2*1.06;
  this.occluder=new THREE.Mesh(copyCameraMesh(first.mesh),
   new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,
    depthTest:true,side:THREE.DoubleSide}));
  this.occluder.renderOrder=-10;
  this.occluder.frustumCulled=false;
  if(!this.update(first))throw new Error("Cannot initialize WiLoR spatial pose");
 }
 private acceptable(o:SpatialObservation):boolean{
  const c=o.mesh?.camera;
  return !!o.mesh?.available&&o.mesh.vertices.length===778&&
   o.mesh.faces.length>100&&o.landmarks.length===21&&
   !!c&&[c.fx,c.fy,c.width,c.height].every(v=>valid(v)&&v>0)&&
   o.mesh.vertices.every(v=>v.length===3&&v.every(valid)&&v[2]>0)&&
   o.landmarks.every(p=>[p.x,p.y,p.z].every(valid)&&p.z>0)&&
   o.mesh.faces.every(f=>f.length===3&&f.every(i=>Number.isInteger(i)&&i>=0&&i<778));
 }
 update(o:SpatialObservation):boolean{
  if(!this.acceptable(o)||o.capturedAt<=this.lastCapture||
   o.side!==this.side)return false;
  const c=o.mesh.camera;
  if(Math.abs(c.fx/this.camera.fx-1)>.2||
     Math.abs(c.fy/this.camera.fy-1)>.2)return false;
  const frame=basis(o.landmarks.map(p=>lift(p,c)),this.finger);
  if(!frame)return false;
  // Filter only rigid ring attachment. Mesh remains the actual posed WiLoR
  // surface; no fabricated 21-joint inverse-distance deformation.
  const alpha=!this.initialized?1:THREE.MathUtils.clamp(
   1-Math.exp(-(o.capturedAt-this.lastCapture)/75),.12,.85);
  this.position.lerp(frame.position,alpha);
  if(this.initialized){
   const flipped=frame.rotation.clone().multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
   if(flipped.angleTo(this.rotation)<frame.rotation.angleTo(this.rotation))
    frame.rotation.copy(flipped);
   this.rotation.slerp(frame.rotation,alpha).normalize();
  }else this.rotation.copy(frame.rotation);
  const attr=this.occluder.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr=attr.array as Float32Array;
  o.mesh.vertices.forEach((v,i)=>{
   arr[i*3]=v[0];arr[i*3+1]=-v[1];arr[i*3+2]=-v[2];
  });
  attr.needsUpdate=true;this.occluder.geometry.computeBoundingSphere();
  this.lastCapture=o.capturedAt;this.lastReceived=o.receivedAt;
  this.initialized=true;
  return true;
 }
 project(camera:THREE.PerspectiveCamera,vw:number,vh:number,w:number,h:number){
  cameraProjection(camera,this.camera,vw,vh,w,h);
 }
 dispose(){
  this.occluder.geometry.dispose();
  (this.occluder.material as THREE.Material).dispose();
 }
}
