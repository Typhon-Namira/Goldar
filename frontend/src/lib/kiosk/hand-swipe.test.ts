import {describe,it,expect} from 'vitest';
import {HandSwipeDetector} from './hand-swipe';
export const hand=(x:number,y=.4)=>[Array.from({length:21},(_,i)=>({x:x+((i%5)-2)*.015,y:y+Math.floor(i/5)*.02,z:0}))];
describe('responsive coherent hand swipes',()=>{
 it('recognizes a fast two-frame sweep in either direction and mirror mode',()=>{
  for(const mirror of [true,false])for(const sign of [-1,1]){
   const d=new HandSwipeDetector();expect(d.update(hand(.5),0,mirror)).toBeNull();
   expect(d.update(hand(.5+.16*sign),60,mirror)).toBe(sign*(mirror?-1:1));
  }
 });
 it('recognizes short sweeps without requiring 120ms or three frames',()=>{
  const d=new HandSwipeDetector();d.update(hand(.3),0,false);
  expect(d.update(hand(.42),35,false)).toBe(1);
 });
 it('bridges a brief blurred/missing hand observation during a fast sweep',()=>{
  const d=new HandSwipeDetector();d.update(hand(.3),0,false);d.update([],50,false);
  expect(d.update(hand(.49),120,false)).toBe(1);
 });
 it('does not turn one long sweep into several product changes',()=>{
  const d=new HandSwipeDetector(),outputs=[];
  for(let i=0;i<13;i++)outputs.push(d.update(hand(.15+i*.055),i*60,false));
  expect(outputs.filter(Boolean)).toEqual([1]);
 });
 it('accepts a deliberate reverse sweep after 300ms rather than imposing a one-second lock',()=>{
  const d=new HandSwipeDetector();d.update(hand(.3),0,false);expect(d.update(hand(.43),60,false)).toBe(1);
  d.update(hand(.46),100,false);d.update(hand(.46),200,false);d.update(hand(.46),300,false);d.update(hand(.46),360,false);
  expect(d.update(hand(.32),410,false)).toBe(-1);
 });
 it('does not recount the tail of a completed sweep after the hand settles',()=>{
  const d=new HandSwipeDetector();d.update(hand(.3),0,false);expect(d.update(hand(.45),60,false)).toBe(1);
  for(const [t,x] of [[120,.53],[180,.58],[240,.6],[300,.6],[360,.6],[420,.6],[500,.6]])
   expect(d.update(hand(x),t,false)).toBeNull();
  expect(d.update(hand(.72),550,false)).toBe(1);
 });
 it('rejects jitter, vertical motion, implausible jumps and inconsistent hand geometry',()=>{
  for(const kind of ['noise','vertical','jump','shape']){
   const d=new HandSwipeDetector();d.update(hand(.3),0,false);
   const next=hand(kind==='noise'?.31:kind==='jump'?.95:.46,kind==='vertical'?.7:.4);
   if(kind==='shape')next[0][5].x+=.4;
   expect(d.update(next,kind==='jump'?25:90,false)).toBeNull();
  }
 });
 it('rejects disconnected observations and malformed hand output',()=>{
  const d=new HandSwipeDetector();expect(d.update([[{x:NaN,y:0}]],0,false)).toBeNull();
  d.update(hand(.3),100,false);expect(d.update(hand(.6),1000,false)).toBeNull();
  expect(d.update(hand(.8),1000,false)).toBeNull();
 });
 it('keeps slower deliberate sweeps responsive',()=>{
  const d=new HandSwipeDetector();d.update(hand(.3),0,false);d.update(hand(.335),180,false);
  expect(d.update(hand(.37),360,false)).toBe(1);
 });
});
