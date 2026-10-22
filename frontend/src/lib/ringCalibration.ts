import * as THREE from "three";

export type RingCalibration={
 center:[number,number,number];
 holeAxis:[number,number,number];
 stoneDirection:[number,number,number];
 innerDiameter:number;
 source:"geometry"|"override"|"fallback";
 bandMesh?:string;
};
export type RingCalibrationOverride=Partial<Pick<RingCalibration,"center"|"holeAxis"|"stoneDirection"|"innerDiameter">>;
const v=(a:readonly number[])=>new THREE.Vector3(a[0],a[1],a[2]);
const arr=(a:THREE.Vector3):[number,number,number]=>[a.x,a.y,a.z];
const finite=(n:number)=>Number.isFinite(n)&&n>1e-5;

export function inspectRingGeometry(model:THREE.Object3D, override?:RingCalibrationOverride):RingCalibration{
 model.updateMatrixWorld(true);
 const inverseRoot=model.matrixWorld.clone().invert();
 const meshes:THREE.Mesh[]=[];
 model.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry?.getAttribute("position"))meshes.push(o)});
 const band=meshes.find(m=>/torus|ringband|shank|band/i.test(m.name))||
  meshes.filter(m=>/ring/i.test(m.name)).sort((a,b)=>b.geometry.getAttribute("position").count-a.geometry.getAttribute("position").count)[0];
 const rootBounds=new THREE.Box3().setFromObject(model);
 const defaultCenter=rootBounds.getCenter(new THREE.Vector3()).applyMatrix4(inverseRoot);
 let center=defaultCenter.clone();
 let axis=new THREE.Vector3(0,1,0);
 let inner=0;
 let source:RingCalibration["source"]="fallback";
 if(band){
  const geo=band.geometry;
  geo.computeBoundingBox();
  const box=geo.boundingBox;
  const attr=geo.getAttribute("position");
  if(box&&attr){
   const dimensions=box.getSize(new THREE.Vector3());
   const sizes=[dimensions.x,dimensions.y,dimensions.z];
   const small=sizes.indexOf(Math.min(...sizes));
   const localCenter=box.getCenter(new THREE.Vector3());
   const localAxis=new THREE.Vector3(small===0?1:0,small===1?1:0,small===2?1:0);
   const toRoot=new THREE.Matrix4().multiplyMatrices(inverseRoot,band.matrixWorld);
   center=localCenter.clone().applyMatrix4(toRoot);
   // Directions transform without translation. normalize after nonuniform scale.
   axis=localAxis.clone().transformDirection(toRoot);
   const radius:number[]=[];
   const point=new THREE.Vector3();
   for(let i=0;i<attr.count;i++){
    point.fromBufferAttribute(attr,i).applyMatrix4(toRoot).sub(center);
    point.addScaledVector(axis,-point.dot(axis));
    const d=point.length();if(finite(d))radius.push(d);
   }
   // Actual inner rim from toroidal band vertex positions, not the overall
   // bounds (which are distorted by gemstone height and rotation).
   if(radius.length>50){
    radius.sort((a,b)=>a-b);
    inner=2*radius[Math.min(radius.length-1,Math.floor(radius.length*.01))];
    if(finite(inner))source="geometry";
   }
  }
 }
 if(!finite(inner)){
  const size=rootBounds.getSize(new THREE.Vector3());
  inner=Math.max(size.x,size.y,size.z)*.72;
 }
 // The gemstone should point away from the center of the finger, toward the camera
 // when the back of the hand faces the camera.
 const stone=meshes.find(m=>/stone|gem|diamond|dodecahedron|setting/i.test(m.name));
 const stoneDirection=new THREE.Vector3(0,0,1);
 if(stone){
  const stoneCenter=new THREE.Box3().setFromObject(stone).getCenter(new THREE.Vector3()).applyMatrix4(inverseRoot);
  stoneDirection.copy(stoneCenter.sub(center));
  stoneDirection.addScaledVector(axis,-stoneDirection.dot(axis));
  if(stoneDirection.lengthSq()>1e-8)stoneDirection.normalize();else stoneDirection.set(0,0,1);
 }
 if(override){
  if(override.center?.length===3&&override.center.every(Number.isFinite))center=v(override.center);
  if(override.holeAxis?.length===3&&override.holeAxis.every(Number.isFinite)&&v(override.holeAxis).lengthSq()>1e-8)axis=v(override.holeAxis).normalize();
  if(override.stoneDirection?.length===3&&override.stoneDirection.every(Number.isFinite)&&v(override.stoneDirection).lengthSq()>1e-8)stoneDirection.copy(v(override.stoneDirection).normalize());
  if(override.innerDiameter!==undefined&&finite(override.innerDiameter))inner=override.innerDiameter;
  source="override";
 }
 return {center:arr(center),holeAxis:arr(axis),stoneDirection:arr(stoneDirection),
  innerDiameter:inner,source,bandMesh:band?.name};
}

export function attachCalibratedRing(model:THREE.Object3D, calibration:RingCalibration):THREE.Group{
 const group=new THREE.Group();
 const center=v(calibration.center);
 // Translation belongs to the model root; do not mutate child mesh transforms.
 model.position.sub(center);
 group.add(model);
 const axis=v(calibration.holeAxis).normalize();
 const align=new THREE.Quaternion().setFromUnitVectors(axis,new THREE.Vector3(0,1,0));
 const stone=v(calibration.stoneDirection).applyQuaternion(align);
 stone.y=0;
 if(stone.lengthSq()>1e-8){
  const spin=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(stone.x,stone.z));
  // Flip the ring about its hole axis: the previous canonical +Z face\n  // placed the gem on the palm-facing side for the current camera basis.\n  const dorsalFlip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);\n  group.quaternion.copy(dorsalFlip.multiply(spin).multiply(align));
 }else group.quaternion.copy(align);
 return group;
}
