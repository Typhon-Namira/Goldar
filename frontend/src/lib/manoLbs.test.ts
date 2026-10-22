import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {skinMano,jointLockedTransform,type ManoRig} from "./manoLbs";
import {approximateCamera,scaleCalibration,reprojectionError} from "./mobileCameraCalibration";

const identity=()=>[[1,0,0],[0,1,0],[0,0,1]];
function rig():ManoRig {
 return {
  templateVertices:Array.from({length:778},()=>[.01,0,0]),
  restJoints:Array.from({length:16},(_,i)=>[0,i*.01,0]),
  parents:Array.from({length:16},(_,i)=>i-1),
  weights:Array.from({length:778},()=>[1,...Array(15).fill(0)])
 };
}
describe("MANO skinning",()=>{
 it("preserves rest mesh under identity pose",()=>{
  const output=skinMano(rig(),{localPose:Array.from({length:16},identity),rootTranslation:[0,0,0]});
  expect(output.vertices[0].x).toBeCloseTo(.01,6);
  expect(output.vertices[0].y).toBeCloseTo(0,6);
 });
 it("applies root rigid motion and joint-local attachment",()=>{
  const output=skinMano(rig(),{localPose:Array.from({length:16},identity),rootTranslation:[.1,.2,.3]});
  expect(output.vertices[0].x).toBeCloseTo(.11,6);
  const attachment=jointLockedTransform(output.jointWorld,0,new THREE.Matrix4().makeTranslation(.01,0,0));
  const p=new THREE.Vector3().setFromMatrixPosition(attachment);
  expect(p.x).toBeCloseTo(.11,6);
  expect(p.y).toBeCloseTo(.2,6);
 });
 it("rejects invalid weights",()=>{
  const bad=rig();bad.weights[0][0]=.5;
  expect(()=>skinMano(bad,{localPose:Array.from({length:16},identity),rootTranslation:[0,0,0]})).toThrow();
 });
});
describe("camera calibration",()=>{
 it("scales intrinsics to video dimensions",()=>{
  const c=scaleCalibration(approximateCamera(640,480),1280,960);
  expect(c.fx).toBeGreaterThan(0);
  expect(c.cx).toBe(640);
  expect(c.cy).toBe(480);
  expect(c.source).toBe("approximate");
 });
 it("computes zero reprojection error for matching correspondences",()=>{
  const c=approximateCamera(640,480);
  const xyz:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[
   [0,0,1],[.1,0,1],[0,.1,1],[.1,.1,1]
  ];
  const uv=xyz.map(([x,y,z])=>({x:c.fx*x/z+c.cx,y:c.fy*y/z+c.cy}));
  expect(reprojectionError(c,xyz,uv)).toBeCloseTo(0,6);
 });
});
