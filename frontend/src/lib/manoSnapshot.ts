/** WiLoR MANO rotations are 3x3 matrices, not axis-angle vectors.
 * Validate the wire payload before allowing it into the live track.
 * Never silently reinterpret camera translation as model-space translation. */
export type ManoSnapshot={
 available:true;model:"MANO";poseRepresentation:"rotation_matrix";
 globalOrient:number[][];handPose:number[][][];betas:number[];
 cameraTranslation:number[]|null;coordinateSystem:string;
 translationCoordinateSystem:string;units:string;
};
const matrix=(v:unknown):v is number[][]=>
 Array.isArray(v)&&v.length===3&&v.every(row=>
  Array.isArray(row)&&row.length===3&&row.every(n=>typeof n==="number"&&Number.isFinite(n)));
const det=(m:number[][])=>
 m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-
 m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+
 m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
const validRotation=(m:number[][])=>{
 if(Math.abs(det(m)-1)>.08)return false;
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){
  const dot=m[i].reduce((sum,v,k)=>sum+v*m[j][k],0);
  if(Math.abs(dot-(i===j?1:0))>.08)return false;
 }
 return true;
};
export function parseManoSnapshot(value:unknown):ManoSnapshot|null{
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(v.available!==true||v.model!=="MANO"||v.poseRepresentation!=="rotation_matrix"||
  !matrix(v.globalOrient)||!validRotation(v.globalOrient)||
  !Array.isArray(v.handPose)||v.handPose.length!==15||
  !v.handPose.every(m=>matrix(m)&&validRotation(m))||
  !Array.isArray(v.betas)||v.betas.length!==10||
  !v.betas.every(n=>typeof n==="number"&&Number.isFinite(n))||
  (v.cameraTranslation!==null&&
   (!Array.isArray(v.cameraTranslation)||v.cameraTranslation.length!==3||
    !v.cameraTranslation.every(n=>typeof n==="number"&&Number.isFinite(n))))||
  v.coordinateSystem!=="wilor_model"||
  v.translationCoordinateSystem!=="camera"||v.units!=="meters")return null;
 return v as ManoSnapshot;
}
