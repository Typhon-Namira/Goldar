import type { BodyPose } from './body-pose';
/** A bounded coarse fit when hair/clothing prevents silhouette acquisition.
 * Never replace an observed contour; require a live visible upper body/face. */
export function estimatedNeck(pose:BodyPose, chinY?:number):BodyPose['neck']{
  const a=pose.points[11],b=pose.points[12],mouthA=pose.points[9],mouthB=pose.points[10];
  const valid=(p:typeof a)=>p&&[p.x,p.y,p.visibility].every(Number.isFinite)&&(p.visibility??0)>.65;
  if(!valid(a)||!valid(b)||pose.width<=0||pose.height<=0)return null;
  const width=Math.abs(a.x-b.x),aspect=pose.width/pose.height;
  if(width<.12)return null;
  if(!Number.isFinite(chinY)){
    if(!valid(mouthA)||!valid(mouthB))return null;
    chinY=(mouthA.y+mouthB.y)/2+width*.14*aspect;
  }
  const shoulderY=(a.y+b.y)/2;
  const y=Math.min(chinY!+width*.115*aspect,shoulderY+width*.02*aspect);
  if(y<chinY!+.008||y>=.97)return null;
  const centre=(a.x+b.x)/2,span=width*.33;
  return {left:centre-span/2,right:centre+span/2,y};
}
