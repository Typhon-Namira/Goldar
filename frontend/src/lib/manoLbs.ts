import * as THREE from "three";

/**
 * MANO linear blend skinning, in metres.
 *
 * All inputs must come from the SAME MANO model version, hand side and
 * coordinate system. WiLoR's 778 posed vertices alone do not provide the
 * canonical template, skinning weights or rest-pose joints.
 *
 * joints and transforms are 16 MANO joints (wrist + 15 finger joints).
 * localPose[i] is the local rotation for joint i, expressed in its parent
 * joint frame; parent[0] must be -1.
 */
export type ManoRig = {
  templateVertices: number[][];
  shapeOffsets?: number[][];
  /** Precomputed pose-corrective displacement for this pose (778 x 3).
   * Must be derived from the MANO posedirs basis and 15 local rotations
   * on the backend, in the exact same rest-space coordinate system. */
  poseOffsets?: number[][];
  restJoints: number[][];
  parents: number[];
  weights: number[][];
};
export type ManoPose = {
  localPose: number[][][];
  rootTranslation: [number,number,number];
};

const isVec3=(v:unknown):v is number[]=>
  Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==="number"&&Number.isFinite(n));
const isRotation=(v:unknown):v is number[][]=>
  Array.isArray(v)&&v.length===3&&v.every(isVec3);

export function validateManoRig(rig:ManoRig):void {
  if(rig.templateVertices.length!==778||rig.weights.length!==778||
     rig.restJoints.length!==16||rig.parents.length!==16||
     rig.parents[0]!==-1)throw new Error("Invalid MANO rig dimensions");
  if(rig.poseOffsets&&rig.poseOffsets.length!==778)
    throw new Error("Invalid MANO pose offsets");
  if(rig.shapeOffsets&&rig.shapeOffsets.length!==778)
    throw new Error("Invalid MANO shape offsets");
  for(let i=0;i<16;i++){
    if(!isVec3(rig.restJoints[i])||
       (i>0&&(!Number.isInteger(rig.parents[i])||rig.parents[i]<0||rig.parents[i]>=i)))
      throw new Error("Invalid MANO skeleton");
  }
  for(let i=0;i<778;i++){
    if(!isVec3(rig.templateVertices[i])||
       (rig.shapeOffsets&&!isVec3(rig.shapeOffsets[i]))||
       (rig.poseOffsets&&!isVec3(rig.poseOffsets[i]))||
       !Array.isArray(rig.weights[i])||rig.weights[i].length!==16||
       rig.weights[i].some(w=>!Number.isFinite(w)||w<0)||
       Math.abs(rig.weights[i].reduce((a,b)=>a+b,0)-1)>.02)
      throw new Error("Invalid MANO vertex or weights");
  }
}

const rotationMatrix=(m:number[][]):THREE.Matrix4=>
  new THREE.Matrix4().set(
    m[0][0],m[0][1],m[0][2],0,
    m[1][0],m[1][1],m[1][2],0,
    m[2][0],m[2][1],m[2][2],0,
    0,0,0,1
  );

export function skinMano(rig:ManoRig,pose:ManoPose):{
  vertices:THREE.Vector3[];
  jointWorld:THREE.Matrix4[];
} {
  validateManoRig(rig);
  if(pose.localPose.length!==16||!pose.localPose.every(isRotation)||
     !isVec3(pose.rootTranslation))
    throw new Error("Invalid MANO pose");
  const restWorld:THREE.Matrix4[]=[];
  const posedWorld:THREE.Matrix4[]=[];
  const skin:THREE.Matrix4[]=[];
  for(let i=0;i<16;i++){
    const p=rig.parents[i],j=rig.restJoints[i];
    const offset=p<0?new THREE.Vector3(...j):
      new THREE.Vector3(j[0]-rig.restJoints[p][0],
        j[1]-rig.restJoints[p][1],j[2]-rig.restJoints[p][2]);
    const restLocal=new THREE.Matrix4().makeTranslation(offset.x,offset.y,offset.z);
    const poseLocal=restLocal.clone().multiply(rotationMatrix(pose.localPose[i]));
    restWorld[i]=p<0?restLocal:restWorld[p].clone().multiply(restLocal);
    posedWorld[i]=p<0?poseLocal:posedWorld[p].clone().multiply(poseLocal);
    skin[i]=posedWorld[i].clone().multiply(restWorld[i].clone().invert());
  }
  const translation=new THREE.Vector3(...pose.rootTranslation);
  const vertices=rig.templateVertices.map((v,i)=>{
    const offset=rig.shapeOffsets?.[i]??[0,0,0];
    const poseOffset=rig.poseOffsets?.[i]??[0,0,0];
    const rest=new THREE.Vector3(v[0]+offset[0]+poseOffset[0],
      v[1]+offset[1]+poseOffset[1],v[2]+offset[2]+poseOffset[2]);
    const out=new THREE.Vector3();
    for(let j=0;j<16;j++){
      const w=rig.weights[i][j];
      if(w>0)out.addScaledVector(rest.clone().applyMatrix4(skin[j]),w);
    }
    return out.add(translation);
  });
  return {vertices,jointWorld:posedWorld.map(m=>
    new THREE.Matrix4().makeTranslation(...pose.rootTranslation).multiply(m))};
}

/** Attach jewelry to a joint-local rigid transform, not to a smoothed
 * mesh centroid. The transform remains stable as the skin deforms. */
export function jointLockedTransform(
  jointWorld:readonly THREE.Matrix4[],jointIndex:number,
  localAttachment:THREE.Matrix4
):THREE.Matrix4 {
  if(!Number.isInteger(jointIndex)||jointIndex<0||jointIndex>=jointWorld.length)
    throw new Error("Invalid attachment joint");
  return jointWorld[jointIndex].clone().multiply(localAttachment);
}
