import * as THREE from "three";

export type MeshPoint = {x:number;y:number;z:number};
export type RemoteHandMesh = {
 available:boolean;
 vertices:number[][];
 faces:number[][];
 camera:{fx:number;fy:number;cx:number;cy:number;width:number;height:number};
};

/**
 * Camera-space MANO surface projected to the same CSS-pixel orthographic
 * overlay as the ring. Remote mesh is a snapshot: align its projected joints
 * to the live MediaPipe joints using a bounded 2D similarity transform.
 * This is NOT a live articulated skin reconstruction.
 */
export function createHandMeshOccluder():THREE.Mesh {
 const geometry=new THREE.BufferGeometry();
 const material=new THREE.MeshBasicMaterial({
  colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide,
  polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
 });
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name="GoldarWiLoRHandDepth";
 mesh.renderOrder=-20;
 mesh.frustumCulled=false;
 mesh.visible=false;
 return mesh;
}

export function updateHandMeshOccluder(args:{
 mesh:THREE.Mesh;
 remote:RemoteHandMesh;
 remoteLandmarks:readonly MeshPoint[];
 liveLandmarks:readonly MeshPoint[];
 toScreen:(p:MeshPoint)=>{x:number;y:number};
 width:number;height:number;
 fingerJoint:number;
 ringDepthOffsetPx?:number;
}):boolean {
 const {mesh,remote,remoteLandmarks,liveLandmarks,toScreen,width,height,fingerJoint}=args;
 const cam=remote.camera;
 if(!remote.available||!cam||remoteLandmarks.length!==21||liveLandmarks.length!==21||
  !Number.isFinite(cam.fx)||!Number.isFinite(cam.fy)||cam.fx<=0||cam.fy<=0||
  cam.width<=0||cam.height<=0||remote.vertices.length<100||
  remote.faces.length<100||width<=0||height<=0)return false;
 // Estimate similarity from palm landmarks in image coordinates; reject stale
 // poses with incompatible hand rotations or dimensions.
 const ids=[0,5,9,13,17];
 const pairs=ids.map(i=>({a:toScreen(remoteLandmarks[i]),b:toScreen(liveLandmarks[i])}));
 const ax=pairs.reduce((s,p)=>s+p.a.x,0)/pairs.length;
 const ay=pairs.reduce((s,p)=>s+p.a.y,0)/pairs.length;
 const bx=pairs.reduce((s,p)=>s+p.b.x,0)/pairs.length;
 const by=pairs.reduce((s,p)=>s+p.b.y,0)/pairs.length;
 let denom=0,cross=0,dot=0;
 for(const p of pairs){
  const x=p.a.x-ax,y=p.a.y-ay,u=p.b.x-bx,v=p.b.y-by;
  denom+=x*x+y*y;dot+=x*u+y*v;cross+=x*v-y*u;
 }
 if(denom<100)return false;
 const scale=Math.hypot(dot,cross)/denom;
 const theta=Math.atan2(cross,dot);
 if(scale<0.65||scale>1.55||Math.abs(theta)>0.65)return false;
 const co=Math.cos(theta)*scale,si=Math.sin(theta)*scale;
 let residual=0;
 for(const p of pairs){
  const x=p.a.x-ax,y=p.a.y-ay;
  residual+=Math.hypot(co*x-si*y+bx-p.b.x,si*x+co*y+by-p.b.y);
 }
 if(residual/pairs.length>18)return false;
 const project=(v:readonly number[])=>{
  const z=v[2];
  if(!v||v.length!==3||!v.every(Number.isFinite)||z<=0)return null;
  // API camera convention: +x right, +y down, +z away.
  const u=(cam.fx*v[0]/z+cam.cx)/cam.width;
  const t=(cam.fy*v[1]/z+cam.cy)/cam.height;
  return toScreen({x:u,y:t,z:0});
 };
 const base=remote.vertices;
 const center=remoteLandmarks[fingerJoint];
 if(!center||!Number.isFinite(center.z)||center.z<=0)return false;
 const positions=new Float32Array(base.length*3);
 const depthScale=Math.max(1,Math.min(width,height))*0.7/center.z;
 for(let i=0;i<base.length;i++){
  const v=base[i],p=project(v);
  if(!p)return false;
  const x=p.x-ax,y=p.y-ay;
  positions[i*3]=co*x-si*y+bx-width/2;
  positions[i*3+1]=height/2-(si*x+co*y+by);
  // Ring lives on z=0. Keep skin surface conservatively behind the
  // jewelry's center; geometry still masks farther parts of the band.
  positions[i*3+2]=(center.z-v[2])*depthScale- (args.ringDepthOffsetPx??5);
 }
 const indices:number[]=[];
 for(const face of remote.faces){
  if(face.length!==3||!face.every(i=>Number.isInteger(i)&&i>=0&&i<base.length))return false;
  // Three.js screen overlay flips the camera Y axis, reversing winding.
  indices.push(face[0],face[2],face[1]);
 }
 const next=new THREE.BufferGeometry();
 next.setAttribute("position",new THREE.BufferAttribute(positions,3));
 next.setIndex(indices);
 next.computeBoundingSphere();
 const old=mesh.geometry;
 mesh.geometry=next;
 old.dispose();
 mesh.visible=true;
 return true;
}
