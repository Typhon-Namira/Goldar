import * as THREE from "three";
import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";
import type {FingerName,HandSide} from "@/lib/handPose";

export type Joint={x:number;y:number;z:number};
export type CameraIntrinsics=RemoteHandMesh["camera"];
const BONES:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
const finite=(n:number)=>Number.isFinite(n);
const clamp=THREE.MathUtils.clamp;
export const lift=(p:Joint,c:CameraIntrinsics)=>new THREE.Vector3(
 (p.x*c.width-c.cx)*p.z/c.fx,-(p.y*c.height-c.cy)*p.z/c.fy,-p.z);
export function cameraProjection(camera:THREE.PerspectiveCamera,c:CameraIntrinsics,vw:number,vh:number,w:number,h:number){
 if(!vw||!vh||!w||!h)return;
 const cover=Math.max(w/vw,h/vh),left=(w-vw*cover)/2,top=(h-vh*cover)/2;
 const fx=c.fx*vw/c.width*cover,fy=c.fy*vh/c.height*cover;
 const cx=c.cx*vw/c.width*cover+left,cy=c.cy*vh/c.height*cover+top;
 const near=.01,far=20;
 camera.near=near;camera.far=far;
 camera.projectionMatrix.set(2*fx/w,0,1-2*cx/w,0,
  0,2*fy/h,2*cy/h-1,0,0,0,-(far+near)/(far-near),-2*far*near/(far-near),
  0,0,-1,0);
 camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
export function fingerBasis(points:readonly THREE.Vector3[],finger:FingerName,side:HandSide){
 const [m,p]=BONES[finger];
 const axis=points[p].clone().sub(points[m]);
 if(axis.length()<.008)return null;
 axis.normalize();
 const across=points[5].clone().sub(points[17]).addScaledVector(axis,
  -points[5].clone().sub(points[17]).dot(axis));
 if(across.length()<.008)return null;
 across.normalize();
 const normal=new THREE.Vector3().crossVectors(across,axis).normalize();
 if(normal.z<0)normal.negate();
 const lateral=new THREE.Vector3().crossVectors(axis,normal).normalize();
 normal.crossVectors(lateral,axis).normalize();
 void side;
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(lateral,axis,normal));
 return {position:points[m].clone().lerp(points[p],.38),quaternion,axis};
}
export class UnifiedHandTrack {
 readonly camera:CameraIntrinsics;
 readonly source:THREE.Vector3[];
 readonly vertices:THREE.Vector3[];
 readonly faces:number[]=[];
 readonly geometry:THREE.BufferGeometry;
 readonly occluder:THREE.Mesh;
 readonly ringPosition=new THREE.Vector3();
 readonly ringRotation=new THREE.Quaternion();
 readonly current:THREE.Vector3[]=[];
 readonly finger:FingerName;
 readonly side:HandSide;
 ringRadius:number;
 private readonly fingerVertexIds:number[]=[];
 private filteredDepth=0;
 readonly createdAt:number;
 lastSeen=0;
 private lastInput=0;
 private readonly nearest:{ids:number[];weights:number[]}[]=[];
 private readonly initial:THREE.Vector3[];
 constructor(mesh:RemoteHandMesh,landmarks:readonly Joint[],finger:FingerName,side:HandSide,createdAt:number){
  if(!mesh.available||!mesh.camera||mesh.vertices.length<100||mesh.faces.length<100||landmarks.length!==21)throw Error("Missing MANO geometry");
  const c=mesh.camera;
  if(![c.fx,c.fy,c.width,c.height].every(v=>finite(v)&&v>0))throw Error("Invalid camera calibration");
  this.camera=c;this.finger=finger;this.side=side;this.createdAt=createdAt;
  this.source=landmarks.map(p=>lift(p,c));
  if(this.source.some(p=>![p.x,p.y,p.z].every(finite)))throw Error("Invalid source joints");
  this.vertices=mesh.vertices.map(v=>new THREE.Vector3(v[0],-v[1],-v[2]));
  if(this.vertices.some(v=>![v.x,v.y,v.z].every(finite)))throw Error("Invalid MANO vertices");
  this.initial=this.vertices.map(v=>v.clone());
  for(const f of mesh.faces){
   if(f.length!==3||f.some(i=>!Number.isInteger(i)||i<0||i>=this.vertices.length))throw Error("Invalid MANO faces");
   this.faces.push(f[0],f[2],f[1]);
  }
  const basis=fingerBasis(this.source,finger,side);
  if(!basis)throw Error("Invalid proximal finger");
  // Fit only a narrow cross-section around the proximal phalanx.
  const radii=this.vertices.flatMap(v=>{
   const d=v.clone().sub(basis.position),along=d.dot(basis.axis);
   if(Math.abs(along)>.0045)return [];
   d.addScaledVector(basis.axis,-along);
   const r=d.length();return r>.004&&r<.015?[r]:[];
  }).sort((a,b)=>a-b);
  this.ringRadius=clamp(radii.length>=8?
   radii[Math.floor(radii.length*.35)]:.009,.0065,.0125);
  // Cache only MANO vertices belonging to the selected proximal phalanx.
  // A generic slice through the whole hand includes palm and other fingers.
  const [mcp,pip]=BONES[finger];
  const bone=this.source[pip].clone().sub(this.source[mcp]);
  const boneLength=bone.length();
  const boneAxis=bone.clone().normalize();
  for(let i=0;i<this.initial.length;i++){
   const offset=this.initial[i].clone().sub(this.source[mcp]);
   const t=offset.dot(boneAxis);
   const radial=offset.addScaledVector(boneAxis,-t).length();
   if(t>boneLength*.14&&t<boneLength*.8&&radial<.017)
    this.fingerVertexIds.push(i);
  }
  this.geometry=new THREE.BufferGeometry();
  const array=new Float32Array(this.vertices.length*3);
  this.vertices.forEach((v,i)=>v.toArray(array,i*3));
  this.geometry.setAttribute("position",new THREE.BufferAttribute(array,3));
  this.geometry.setIndex(this.faces);
  this.occluder=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({
   colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide
  }));
  this.occluder.renderOrder=-10;this.occluder.frustumCulled=false;
  for(const v of this.initial){
   const nearest=this.source.map((p,i)=>({i,d:p.distanceToSquared(v)}))
    .sort((a,b)=>a.d-b.d).slice(0,4);
   const weights=nearest.map(n=>1/(n.d+.000025));
   const sum=weights.reduce((a,b)=>a+b,0);
   this.nearest.push({ids:nearest.map(n=>n.i),weights:weights.map(w=>w/sum)});
  }
 }
 /** Align MediaPipe normalized live joints with WiLoR camera-metric depth.
  * MediaPipe world coordinates are deliberately not mixed with camera coordinates.
  * The WiLoR capture provides a metric depth prior, while live image joints drive
  * per-frame projection, position and articulation in one camera coordinate system. */
 update(live:readonly Joint[],now:number):boolean{
  if(live.length!==21||live.some(p=>![p.x,p.y,p.z].every(finite)))return false;
  const srcWidth=Math.hypot(this.source[5].x-this.source[17].x,this.source[5].y-this.source[17].y);
  const imageWidth=Math.hypot(live[5].x-live[17].x,live[5].y-live[17].y);
  if(imageWidth<.025||!finite(imageWidth)||srcWidth<.005)return false;
  const referenceWidth=Math.hypot(
   (this.source[5].x/-this.source[5].z*this.camera.fx-this.source[17].x/-this.source[17].z*this.camera.fx)/this.camera.width,
   (-this.source[5].y/-this.source[5].z*this.camera.fy+this.source[17].y/-this.source[17].z*this.camera.fy)/this.camera.height);
  if(referenceWidth<.015||!finite(referenceWidth))return false;
  // Estimate the global depth by minimizing reprojection errors of several
  // bone lengths rather than relying on a single palm-width ratio.
  // This is a relative depth estimate; absolute metric scale remains
  // unobservable without a calibrated external reference.
  const bones:[number,number][]=[[0,5],[0,9],[0,13],[0,17],
   [5,6],[6,7],[7,8],[9,10],[10,11],[11,12],
   [13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
  const rootDepth=-this.source[0].z;
  const ratios:number[]=[];
  for(const [a,b] of bones){
   const baseline=this.source[a].distanceTo(this.source[b]);
   const dx=(live[a].x-live[b].x)*this.camera.width/this.camera.fx;
   const dy=(live[a].y-live[b].y)*this.camera.height/this.camera.fy;
   const imageLength=Math.hypot(dx,dy);
   if(imageLength>.003&&baseline>.006)ratios.push(baseline/imageLength);
  }
  ratios.sort((a,b)=>a-b);
  const median=ratios.length?ratios[Math.floor(ratios.length/2)]:rootDepth*referenceWidth/imageWidth;
  const estimatedDepth=clamp(median,rootDepth*.65,rootDepth*1.5);
  if(this.filteredDepth===0)this.filteredDepth=estimatedDepth;
  else {
   const dt=Math.max(1,now-this.lastInput);
   const maxStep=this.filteredDepth*.14*Math.min(dt/1000,.1);
   const target=clamp(estimatedDepth,this.filteredDepth-maxStep,this.filteredDepth+maxStep);
   this.filteredDepth=THREE.MathUtils.lerp(this.filteredDepth,target,
    clamp(1-Math.exp(-dt/220),.02,.35));
  }
  const globalDepth=this.filteredDepth;
  const targets=live.map((p,i)=>{
   // Preserve relative MANO depth offsets; translate the hand as a whole
   // using the multi-bone estimate. Avoid interpreting MediaPipe z as meters.
   const depth=clamp(globalDepth+(-this.source[i].z-rootDepth),.08,4);
   return lift({x:p.x,y:p.y,z:depth},this.camera);
  });
  const basis=fingerBasis(targets,this.finger,this.side);
  if(!basis)return false;
  if(this.current.length){
   const jump=basis.position.distanceTo(this.ringPosition);
   const dt=now-this.lastInput;
   if(dt<450&&(jump>.075||this.ringRotation.angleTo(basis.quaternion)>1.05))return false;
  }
  const alpha=this.current.length?clamp(1-Math.exp(-Math.max(1,now-this.lastInput)/48),.06,.55):1;
  for(let i=0;i<21;i++){
   if(!this.current[i])this.current[i]=targets[i].clone();
   else this.current[i].lerp(targets[i],alpha);
  }
  const smoothed=fingerBasis(this.current,this.finger,this.side);
  if(!smoothed)return false;
  if(this.lastInput>0){
   const flipped=smoothed.quaternion.clone().multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
   if(flipped.angleTo(this.ringRotation)<smoothed.quaternion.angleTo(this.ringRotation))
    smoothed.quaternion.copy(flipped);
  }
  // Ring orientation follows the local finger bone. Position and radius
  // are refined below using the live, articulated skin cross-section.
  const attribute=this.geometry.getAttribute("position") as THREE.BufferAttribute;
  const array=attribute.array as Float32Array;
  for(let i=0;i<this.initial.length;i++){
   const skin=this.nearest[i];
   const v=new THREE.Vector3();
   // Blend local rigid transforms around neighboring joints. This preserves
   // the volume of each finger segment better than joint translation alone.
   for(let k=0;k<skin.ids.length;k++){
    const j=skin.ids[k],w=skin.weights[k];
    const parent=j===0?9:j<=4?j-1:j<=8?(j===5?0:j-1):
     j<=12?(j===9?0:j-1):j<=16?(j===13?0:j-1):(j===17?0:j-1);
    const sourceAxis=this.source[j].clone().sub(this.source[parent]);
    const targetAxis=this.current[j].clone().sub(this.current[parent]);
    const rotation=new THREE.Quaternion();
    if(sourceAxis.lengthSq()>1e-7&&targetAxis.lengthSq()>1e-7)
     rotation.setFromUnitVectors(sourceAxis.normalize(),targetAxis.normalize());
    const local=this.initial[i].clone().sub(this.source[j]).applyQuaternion(rotation);
    v.addScaledVector(local.add(this.current[j]),w);
   }
   v.toArray(array,i*3);
  }
  const crossSection:{radial:THREE.Vector3;radius:number}[]=[];
  const center=smoothed.position.clone();
  const axis=smoothed.axis;
  const point=new THREE.Vector3();
  for(const i of this.fingerVertexIds){
   point.fromArray(array,i*3).sub(center);
   const along=point.dot(axis);
   if(Math.abs(along)>.004)continue;
   const radial=point.clone().addScaledVector(axis,-along);
   const radius=radial.length();
   if(radius>.003&&radius<.018)crossSection.push({radial,radius});
  }
  let surfaceCenter=center;
  if(crossSection.length>=10){
   crossSection.sort((a,b)=>a.radius-b.radius);
   const section=crossSection.slice(0,Math.max(8,Math.floor(crossSection.length*.8)));
   const offset=new THREE.Vector3();
   for(const v of section)offset.add(v.radial);
   offset.multiplyScalar(1/section.length).clampLength(0,.0025);
   surfaceCenter=center.clone().add(offset);
   const radii=section.map(v=>v.radial.distanceTo(offset)).sort((a,b)=>a-b);
   const measured=clamp(radii[Math.floor(radii.length*.6)],.006,.0125);
   this.ringRadius=THREE.MathUtils.lerp(this.ringRadius,measured,alpha*.25);
  }
  if(this.lastInput===0)this.ringPosition.copy(surfaceCenter);
  else this.ringPosition.lerp(surfaceCenter,alpha);
  if(this.lastInput===0)this.ringRotation.copy(smoothed.quaternion);
  else this.ringRotation.slerp(smoothed.quaternion,alpha).normalize();
  attribute.needsUpdate=true;
  this.geometry.computeBoundingSphere();
  this.lastSeen=now;this.lastInput=now;
  return true;
 }
 dispose(){this.geometry.dispose();(this.occluder.material as THREE.Material).dispose()}
}
