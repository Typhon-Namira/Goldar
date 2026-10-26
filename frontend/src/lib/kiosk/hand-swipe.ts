import type { SwipeDirection } from './swipe';
export type HandPoint = {x:number;y:number;z?:number};
/** Palm-centre trajectories, independent of cropped shoulders/body pose. */
export class HandSwipeDetector {
  private samples: {x:number;y:number;time:number}[] = [];
  private cooldown = 0;
  private previous = -Infinity;
  update(hands: HandPoint[][], time:number, mirrored:boolean): SwipeDirection | null {
    if (!Number.isFinite(time) || time <= this.previous) return null;
    if (time-this.previous > 500) this.samples=[];
    this.previous=time;
    const hand=hands[0];
    if (time < this.cooldown || !hand || hand.length < 21 ||
        ![0,5,9,13,17].every(i=>Number.isFinite(hand[i]?.x)&&Number.isFinite(hand[i]?.y))) {
      this.samples=[]; return null;
    }
    const palm=[0,5,9,13,17].map(i=>hand[i]);
    let x=palm.reduce((s,p)=>s+p.x,0)/5;
    const y=palm.reduce((s,p)=>s+p.y,0)/5;
    if(mirrored)x=1-x;
    const last=this.samples.at(-1);
    if(last&&Math.hypot(x-last.x,y-last.y)>.3)this.samples=[];
    this.samples.push({x,y,time});
    while(this.samples.length&&time-this.samples[0].time>1100)this.samples.shift();
    if(this.samples.length<3)return null;
    const first=this.samples[0],dx=x-first.x;
    if(time-first.time<120||Math.abs(dx)<.085)return null;
    const dy=Math.max(...this.samples.map(p=>p.y))-Math.min(...this.samples.map(p=>p.y));
    const steps=this.samples.slice(1).map((p,i)=>Math.abs(p.x-this.samples[i].x));
    if(dy>Math.max(.065,Math.abs(dx)*.6)||steps.filter(d=>d>.012).length<2||
        Math.abs(dx)/Math.max(.001,steps.reduce((s,d)=>s+d,0))<.75)return null;
    this.samples=[];this.cooldown=time+1000;
    return dx>0?1:-1;
  }
}
