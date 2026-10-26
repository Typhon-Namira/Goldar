import { describe,it,expect } from 'vitest';
import { HandSwipeDetector } from './hand-swipe';
const hand=(x:number,y=.4)=>[Array.from({length:21},()=>({x,y,z:0}))];
describe('independent palm swipes',()=>{
  it('recognizes small deliberate swipes without any shoulder/torso landmarks',()=>{
    for(const mirror of [true,false])for(const sign of [-1,1]){
      const d=new HandSwipeDetector();
      expect(d.update(hand(.5),0,mirror)).toBeNull();
      expect(d.update(hand(.5+.05*sign),100,mirror)).toBeNull();
      expect(d.update(hand(.5+.1*sign),200,mirror)).toBe(sign*(mirror?-1:1));
      expect(d.update(hand(.3),300,mirror)).toBeNull();
      expect(d.update(hand(.5),450,mirror)).toBeNull();
    }
  });
  it('accepts slower sweeps while rejecting noise and vertical movement',()=>{
    const d=new HandSwipeDetector();
    d.update(hand(.3),0,false);d.update(hand(.35),400,false);
    expect(d.update(hand(.4),800,false)).toBe(1);
    for(const kind of ['noise','vertical']){
      const detector=new HandSwipeDetector();
      for(let i=0;i<5;i++)expect(detector.update(hand(kind==='noise'?.5+i*.004:.3+i*.04,kind==='vertical'?.2+i*.08:.4),i*100,false)).toBeNull();
    }
  });
  it('does not connect different hands, missing frames, or a single teleport',()=>{
    const d=new HandSwipeDetector();
    d.update(hand(.3),0,false);d.update(hand(.3),100,false);
    expect(d.update(hand(.6),200,false)).toBeNull();
    d.update([],300,false);expect(d.update(hand(.4),400,false)).toBeNull();
    expect(d.update(hand(.6),1200,false)).toBeNull();
    expect(d.update(hand(.7),1200,false)).toBeNull();
  });
  it('ignores malformed landmarks without poisoning later detections',()=>{
    const d=new HandSwipeDetector();
    expect(d.update([[{x:NaN,y:0}]],0,false)).toBeNull();
    expect(d.update(hand(.3),100,false)).toBeNull();
    expect(d.update(hand(.35),200,false)).toBeNull();
    expect(d.update(hand(.4),300,false)).toBe(1);
  });
});
