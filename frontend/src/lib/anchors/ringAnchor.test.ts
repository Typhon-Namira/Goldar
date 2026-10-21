import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {estimateAnatomicalRingAnchor} from "./ringAnchor";
import type {HandPoint} from "../handPose";

function hand():HandPoint[]{
 const a=Array.from({length:21},()=>({x:0.5,y:0.5,z:0}));
 a[0]={x:.5,y:.9,z:0};a[5]={x:.35,y:.52,z:0};a[9]={x:.45,y:.49,z:0};
 a[13]={x:.55,y:.51,z:0};a[17]={x:.65,y:.55,z:0};
 for(const [m,p,d] of [[5,6,7],[9,10,11],[13,14,15],[17,18,19]]){
   a[p]={x:a[m].x,y:a[m].y-.12,z:0};
   a[d]={x:a[m].x,y:a[m].y-.22,z:0};
 }
 return a;
}
const solve=(a:HandPoint[],overrides:Record<string,unknown>={})=>estimateAnatomicalRingAnchor({
 landmarks:a,finger:"ring",toScreen:p=>({x:p.x*1000,y:p.y*1000}),width:1000,height:1000,
 holeDiameter:1,anchorFraction:.22,fitMultiplier:1,widthCalibration:1,
 reportedSide:"Left",cameraFacing:"user",...overrides
});
describe("isolated anatomical anchor",()=>{
 it("calculates finite normalized orientation and positive scale",()=>{
  const p=solve(hand());expect(p).not.toBeNull();
  expect(p!.position.x).toBeCloseTo(50,5);
  expect(p!.scale).toBeGreaterThan(0);
  expect(p!.quaternion.length()).toBeCloseTo(1,6);
  expect(p!.axis.length()).toBeCloseTo(1,6);
 });
 it("translates with camera landmarks without changing the ring orientation",()=>{
  const base=solve(hand())!;
  const shifted=solve(hand().map(p=>({...p,x:p.x+.04,y:p.y+.03})))!;
  expect(shifted.position.x-base.position.x).toBeCloseTo(40,5);
  expect(shifted.position.y-base.position.y).toBeCloseTo(-30,5);
  expect(Math.abs(base.quaternion.dot(shifted.quaternion))).toBeCloseTo(1,5);
 });
 it("keeps scale proportional to explicit fit adjustment",()=>{
  const base=solve(hand())!;
  const adjusted=solve(hand(),{fitMultiplier:1.2})!;
  expect(adjusted.scale/base.scale).toBeCloseTo(1.2,6);
 });
 it("uses a distinct local finger longitudinal axis when the hand rotates in image space",()=>{
  const base=hand(),center={x:.5,y:.5},angle=Math.PI/3;
  const transformed=base.map(p=>({x:center.x+(p.x-center.x)*Math.cos(angle)-(p.y-center.y)*Math.sin(angle),
   y:center.y+(p.x-center.x)*Math.sin(angle)+(p.y-center.y)*Math.cos(angle),z:p.z}));
  const p=solve(transformed);expect(p).not.toBeNull();
  expect(p!.axis.angleTo(new THREE.Vector3(0,1,0))).toBeGreaterThan(.3);
  expect(p!.quaternion.length()).toBeCloseTo(1,6);
 });
 it("rejects invalid geometry, missing hand identity, and non-finite projections",()=>{
  expect(solve(hand().slice(0,12))).toBeNull();
  expect(solve(hand(),{reportedSide:"Unknown"})).toBeNull();
  expect(solve(hand(),{holeDiameter:0})).toBeNull();
  expect(solve(hand(),{depthFactor:NaN})).toBeNull();
  expect(solve(hand(),{toScreen:()=>({x:NaN,y:0})})).toBeNull();
 });
});
