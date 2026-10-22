/**
 * Mobile-browser camera calibration utilities.
 *
 * Web getUserMedia does not expose trusted focal length, principal point,
 * lens distortion or camera pose on both iOS Safari and Android Chrome.
 * Calibration must therefore be explicit or be labelled approximate.
 */
export type CameraCalibration={
 width:number;height:number;fx:number;fy:number;cx:number;cy:number;
 source:"measured"|"approximate";
};
export type PixelPoint={x:number;y:number};
const finite=(x:number)=>Number.isFinite(x);
export function approximateCamera(width:number,height:number,
  horizontalFovDegrees=65):CameraCalibration{
 if(width<=0||height<=0||!finite(horizontalFovDegrees)||
    horizontalFovDegrees<30||horizontalFovDegrees>110)
  throw new Error("Invalid camera geometry");
 const fx=width/(2*Math.tan(horizontalFovDegrees*Math.PI/360));
 return {width,height,fx,fy:fx,cx:width/2,cy:height/2,source:"approximate"};
}
export function scaleCalibration(c:CameraCalibration,width:number,height:number):CameraCalibration{
 if(![width,height,c.width,c.height,c.fx,c.fy,c.cx,c.cy].every(finite)||
   width<=0||height<=0||c.width<=0||c.height<=0||c.fx<=0||c.fy<=0)
  throw new Error("Invalid camera calibration");
 const sx=width/c.width,sy=height/c.height;
 return {width,height,fx:c.fx*sx,fy:c.fy*sy,cx:c.cx*sx,cy:c.cy*sy,source:c.source};
}
export function reprojectionError(c:CameraCalibration,
  points3d:readonly [number,number,number][],
  points2d:readonly PixelPoint[]):number{
 if(points3d.length!==points2d.length||points3d.length<4)
  throw new Error("At least four correspondences are required");
 let sum=0;
 for(let i=0;i<points3d.length;i++){
  const [x,y,z]=points3d[i],p=points2d[i];
  if(![x,y,z,p.x,p.y].every(finite)||z<=0)throw new Error("Invalid correspondence");
  const u=c.fx*x/z+c.cx,v=c.fy*y/z+c.cy;
  sum+=(u-p.x)**2+(v-p.y)**2;
 }
 return Math.sqrt(sum/points3d.length);
}
