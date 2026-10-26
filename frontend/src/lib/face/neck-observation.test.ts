import {expect,it} from 'vitest';
import {estimatedNeck} from './neck-observation';
import type {BodyPose} from './body-pose';
const pose=():BodyPose=>{
 const points=Array.from({length:33},()=>({x:.5,y:.35,z:0,visibility:1}));
 points[11]={x:.7,y:.6,z:0,visibility:1};points[12]={x:.3,y:.6,z:0,visibility:1};
 return {points,time:0,width:640,height:480};
};
it('provides a bounded visible necklace fit without a segmented silhouette',()=>{
 const p=pose(),neck=estimatedNeck(p,.42)!;
 expect(neck).toBeTruthy();expect(neck.y).toBeGreaterThan(.42);expect(neck.y).toBeLessThan(.6);
 expect((neck.left+neck.right)/2).toBeCloseTo(.5);
 expect(neck.right-neck.left).toBeCloseTo(.132);
});
it('can use the visible mouth when the separate face engine temporarily misses the chin',()=>{
 expect(estimatedNeck(pose())).toBeTruthy();
});
it('rejects missing shoulders/face and impossible anatomy instead of fitting arbitrary frames',()=>{
 const p=pose();p.points[12].visibility=.1;expect(estimatedNeck(p,.42)).toBeNull();
 const missing=pose();missing.points[9].visibility=.1;expect(estimatedNeck(missing)).toBeNull();
 expect(estimatedNeck(pose(),.8)).toBeNull();
});
