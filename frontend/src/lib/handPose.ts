import type {HandLandmarkerResult} from "@mediapipe/tasks-vision";

export type FingerName="index"|"middle"|"ring"|"pinky";
export type HandSide="Left"|"Right"|"Unknown";
export type PalmView="palm"|"back"|"edge"|"unknown";
export type Point3={x:number;y:number;z:number};
export type Vec3=[number,number,number];
export type FingerFrame={origin:Point3;longitudinal:Vec3;transverse:Vec3;normal:Vec3;confidence:number};
export type HandPose={hand:HandSide;view:PalmView;frame:FingerFrame;landmarks:Point3[];worldLandmarks:Point3[]|null};

const JOINTS:Record<FingerName,[number,number]>={index:[5,6],middle:[9,10],ring:[13,14],pinky:[17,18]};
const sub=(a:Point3,b:Point3):Vec3=>[a.x-b.x,a.y-b.y,a.z-b.z];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(a:Vec3)=>Math.sqrt(dot(a,a));
const normalize=(a:Vec3):Vec3=>{const n=norm(a);return n>1e-7?[a[0]/n,a[1]/n,a[2]/n]:[0,0,0]};
const negate=(a:Vec3):Vec3=>[-a[0],-a[1],-a[2]];
const midpoint=(a:Point3,b:Point3,t:number):Point3=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

/**
 * This is a wrist-independent, camera-coordinate anatomical frame.
 * The normalized image coordinates are only used for 2D placement;
 * worldLandmarks provide directional estimation, not metric ring sizing.
 */
export function estimateHandPose(result:HandLandmarkerResult,finger:FingerName):HandPose|null{
 const points=result.landmarks?.[0] as Point3[]|undefined;
 if(!points||points.length!==21)return null;
 const rawWorld=result.worldLandmarks?.[0] as Point3[]|undefined;
 const world=rawWorld?.length===21?rawWorld:null;
 const joints=JOINTS[finger];
 const metric=world??points;
 // MediaPipe image and world landmark Y convention points down; bring to display Y-up.
 const point=(p:Point3):Point3=>({x:p.x,y:-p.y,z:-p.z});
 const a=point(metric[joints[0]]),b=point(metric[joints[1]]);
 const longitudinal=normalize(sub(b,a));
 const across=normalize(sub(point(metric[5]),point(metric[17])));
 const projected:Vec3=[across[0]-longitudinal[0]*dot(across,longitudinal),across[1]-longitudinal[1]*dot(across,longitudinal),across[2]-longitudinal[2]*dot(across,longitudinal)];
 let transverse=normalize(projected);
 let normal=normalize(cross(transverse,longitudinal));
 if(norm(normal)<.5)return null;
 // Orient normal continuously toward the camera's half space.
 if(normal[2]<0){normal=negate(normal);transverse=negate(transverse)}
 transverse=normalize(cross(longitudinal,normal));
 const palmNormal=normalize(cross(normalize(sub(point(metric[5]),point(metric[17]))),normalize(sub(point(metric[9]),point(metric[0])))));
 const facing=dot(palmNormal,[0,0,1]);
 const view:PalmView=Math.abs(facing)<.20?"edge":facing>0?"palm":"back";
 const label=result.handedness?.[0]?.[0]?.categoryName;
 const hand:HandSide=label==="Left"||label==="Right"?label:"Unknown";
 const confidence=Math.max(0,Math.min(1,(result.handedness?.[0]?.[0]?.score??.6)));
 return {hand,view,frame:{origin:midpoint(points[joints[0]],points[joints[1]],.22),longitudinal,transverse,normal,confidence},landmarks:points,worldLandmarks:world};
}

/** Exponential vector smoothing, independent of camera frame rate. */
export function smoothingGain(dtSeconds:number,frequency:number):number{
 return 1-Math.exp(-Math.max(0,Math.min(.15,dtSeconds))*Math.max(0,frequency));
}
