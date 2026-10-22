import * as THREE from "three";

export type MeshPoint={x:number;y:number;z:number};
export type RemoteHandMesh={
 available:boolean;reason?:string;vertices:number[][];faces:number[][];
 camera:{fx:number;fy:number;cx:number;cy:number;width:number;height:number};
};
type Pixel={x:number;y:number};
const FINITE=(p:Pixel)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const JOINTS=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];

/** Invisible hand surface: only writes depth, never hand color. */
export function createHandMeshOccluder():THREE.Mesh{
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({
  colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide
 }));
 mesh.name="GoldarWiLoRHandDepth";mesh.renderOrder=-20;
 mesh.frustumCulled=false;mesh.visible=false;return mesh;
}

/**
 * Project the WiLoR camera-space MANO mesh using the SAME cover transform as
 * the live video. Warp the snapshot by live 2D joints, with per-vertex local
 * inverse-distance weights. Reject large deformations rather than showing
 * stale, detached skin. Monocular mesh depth is approximate, not metric AR.
 */
export function updateHandMeshOccluder(args:{
 mesh:THREE.Mesh;remote:RemoteHandMesh;
 remoteLandmarks:readonly MeshPoint[];liveLandmarks:readonly MeshPoint[];
 toScreen:(p:MeshPoint)=>Pixel;width:number;height:number;
 fingerJoint:number;ringDepthOffsetPx?:number;ringWidthPx?:number;
}):boolean{
 const {mesh,remote,remoteLandmarks,liveLandmarks,toScreen,width,height,fingerJoint}=args;
 const cam=remote.camera;
 if(!remote.available||!cam||remoteLandmarks.length!==21||liveLandmarks.length!==21||
  !Number.isFinite(cam.fx)||!Number.isFinite(cam.fy)||cam.fx<=0||cam.fy<=0||
  cam.width<=0||cam.height<=0||remote.vertices.length<100||
  remote.faces.length<100||width<=0||height<=0)return false;
 // WiLoR landmarks are normalized in its 480x360 capture; the cover
 // transform must be applied only once, to both WiLoR and MediaPipe.
 const source=remoteLandmarks.map(toScreen),target=liveLandmarks.map(toScreen);
 if(!source.every(FINITE)||!target.every(FINITE))return false;
 const palm=[0,5,9,13,17];
 const avg=(a:Pixel[],ids:number[])=>({
  x:ids.reduce((v,i)=>v+a[i].x,0)/ids.length,
  y:ids.reduce((v,i)=>v+a[i].y,0)/ids.length
 });
 const a=avg(source,palm),b=avg(target,palm);
 let dot=0,cross=0,den=0;
 for(const i of palm){
  const x=source[i].x-a.x,y=source[i].y-a.y;
  const u=target[i].x-b.x,v=target[i].y-b.y;
  dot+=x*u+y*v;cross+=x*v-y*u;den+=x*x+y*y;
 }
 if(den<64)return false;
 const scale=Math.hypot(dot,cross)/den,angle=Math.atan2(cross,dot);
 if(scale<0.7||scale>1.45||Math.abs(angle)>0.55)return false;
 const c=scale*Math.cos(angle),s=scale*Math.sin(angle);
 const rigid=(p:Pixel):Pixel=>{
  const x=p.x-a.x,y=p.y-a.y;
  return {x:b.x+c*x-s*y,y:b.y+s*x+c*y};
 };
 let palmError=0;
 for(const i of palm){
  const p=rigid(source[i]);
  palmError+=Math.hypot(p.x-target[i].x,p.y-target[i].y);
 }
 const handWidth=Math.hypot(target[5].x-target[17].x,target[5].y-target[17].y);
 if(handWidth<24||palmError/palm.length>Math.max(12,handWidth*0.16))return false;
 // Reject an old snapshot after a major finger bend; the 2D warp is
 // deliberately limited and cannot reconstruct unseen skin geometry.
 const fingerIds=[fingerJoint,fingerJoint+1,fingerJoint+2,fingerJoint+3];
 for(const i of fingerIds){
  const p=rigid(source[i]);
  if(Math.hypot(p.x-target[i].x,p.y-target[i].y)>handWidth*0.33)return false;
 }
 const projected=(v:readonly number[]):Pixel|null=>{
  if(v.length!==3||!v.every(Number.isFinite)||v[2]<=1e-5)return null;
  return toScreen({x:(cam.fx*v[0]/v[2]+cam.cx)/cam.width,
   y:(cam.fy*v[1]/v[2]+cam.cy)/cam.height,z:0});
 };
 const center=remoteLandmarks[fingerJoint];
 if(!center||!Number.isFinite(center.z)||center.z<=0)return false;
 const verts=remote.vertices,positions=new Float32Array(verts.length*3);
 const fingerWidth=Math.max(8,args.ringWidthPx||handWidth*.22);
 // Scale metric WiLoR depth to a conservative on-screen finger radius.
 // Z=0 is the ring's mounting plane, negative Z is farther from camera.
 const depthScale=fingerWidth/Math.max(0.012,center.z*0.12);
 const displacements=JOINTS.map(i=>{
  const p=rigid(source[i]);return {x:target[i].x-p.x,y:target[i].y-p.y};
 });
 for(let i=0;i<verts.length;i++){
  const v=verts[i],p=projected(v);
  if(!p)return false;
  const r=rigid(p);
  // Deform locally toward nearby live finger joints. A bounded correction
  // avoids stretching the entire hand after one bad landmark.
  let wx=0,wy=0,sum=0;
  for(const j of JOINTS){
   const dx=p.x-source[j].x,dy=p.y-source[j].y;
   const weight=1/(dx*dx+dy*dy+100);
   wx+=displacements[j].x*weight;wy+=displacements[j].y*weight;sum+=weight;
  }
  const maxShift=fingerWidth*.45;
  const ox=THREE.MathUtils.clamp(wx/sum,-maxShift,maxShift);
  const oy=THREE.MathUtils.clamp(wy/sum,-maxShift,maxShift);
  positions[i*3]=r.x+ox-width/2;
  positions[i*3+1]=height/2-(r.y+oy);
  positions[i*3+2]=THREE.MathUtils.clamp((center.z-v[2])*depthScale,
   -fingerWidth*.55,fingerWidth*.55)-(args.ringDepthOffsetPx??0);
 }
 const indices:number[]=[];
 for(const face of remote.faces){
  if(face.length!==3||!face.every(i=>Number.isInteger(i)&&i>=0&&i<verts.length))return false;
  indices.push(face[0],face[2],face[1]);
 }
 const geo=mesh.geometry,old=geo.getAttribute("position") as THREE.BufferAttribute|undefined;
 if(old?.count===verts.length){(old.array as Float32Array).set(positions);old.needsUpdate=true}
 else geo.setAttribute("position",new THREE.BufferAttribute(positions,3));
 if(!geo.index||geo.index.count!==indices.length)geo.setIndex(indices);
 geo.computeBoundingSphere();mesh.visible=true;return true;
}
