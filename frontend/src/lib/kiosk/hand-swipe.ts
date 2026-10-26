import type { SwipeDirection } from './swipe';
export type HandPoint = { x: number; y: number; z?: number };
type Sample = { x: number; y: number; time: number; span: number; shape: number[] };
/** Low-latency palm motion: a coherent fast two-frame sweep, or a slower
 * trajectory. Rearm after a pause/exit/reversal, never midway through a sweep. */
export class HandSwipeDetector {
  private samples: Sample[] = [];
  private cooldown = 0;
  private previous = -Infinity;
  private armed = true;
  private direction = 0;
  private idleSince: number | null = null;
  update(hands: HandPoint[][], time: number, mirrored: boolean): SwipeDirection | null {
    if (!Number.isFinite(time) || time <= this.previous) return null;
    this.previous = time;
    const last = this.samples.at(-1), hand = hands[0];
    if (last && time - last.time > 240) { this.samples = []; this.armed = true; this.idleSince = null; }
    if (!hand || hand.length < 21 || ![0,5,9,13,17].every(i => Number.isFinite(hand[i]?.x) && Number.isFinite(hand[i]?.y))) {
      if (!last || time - last.time > 180) { this.samples = []; this.armed = true; }
      return null;
    }
    const palm = [0,5,9,13,17].map(i => hand[i]);
    const rawX = palm.reduce((s,p) => s+p.x,0)/5, y = palm.reduce((s,p) => s+p.y,0)/5;
    const span = Math.hypot(hand[5].x-hand[17].x, hand[5].y-hand[17].y);
    if (span < .012 || span > .5) return null;
    const sample: Sample = { x: mirrored ? 1-rawX : rawX, y, time, span,
      shape: palm.flatMap(p => [(p.x-rawX)/span,(p.y-y)/span]) };
    const prior = this.samples.at(-1);
    if (prior && Math.abs(sample.x-prior.x) < Math.max(.006,span*.08)) {
      this.idleSince ??= prior.time;
      if (time-this.idleSince >= 90 && !this.armed) {
        this.armed = true;
        // Rearming starts a NEW gesture. Keeping the old sweep here caused
        // its tail to be counted a second time after the cooldown expired.
        this.samples = [];
      }
    } else this.idleSince = null;
    this.samples.push(sample);
    while (this.samples.length && time-this.samples[0].time > 600) this.samples.shift();
    if (!prior || time < this.cooldown) return null;
    const coherent = (a:Sample) => {
      const ratio=sample.span/a.span;
      const error=Math.sqrt(sample.shape.reduce((s,v,i)=>s+(v-a.shape[i])**2,0)/sample.shape.length);
      return ratio > .55 && ratio < 1.8 && error < .7;
    };
    const accept = (dx:number) => {
      const direction = dx > 0 ? 1 : -1;
      if (!this.armed && direction === this.direction) return null;
      this.direction = direction; this.armed = false; this.idleSince = null;
      this.cooldown = time + 300; this.samples = [sample];
      return direction as SwipeDirection;
    };
    const dx=sample.x-prior.x, dt=time-prior.time, speed=Math.abs(dx)/(dt/1000);
    if (dt>=20 && dt<=240 && Math.abs(dx)>=Math.max(.065,span*.65) && speed>=.45 && speed<=7 &&
        Math.abs(sample.y-prior.y)<=Math.max(.055,Math.abs(dx)*.65) && coherent(prior)) return accept(dx);
    if(this.samples.length<3)return null;
    const first=this.samples[0], travelX=sample.x-first.x;
    const vertical=Math.max(...this.samples.map(p=>p.y))-Math.min(...this.samples.map(p=>p.y));
    const steps=this.samples.slice(1).map((p,i)=>Math.abs(p.x-this.samples[i].x));
    if(time-first.time>=70 && Math.abs(travelX)>=.065 && vertical<=Math.max(.055,Math.abs(travelX)*.65) &&
        steps.filter(d=>d>.006).length>=2 && Math.abs(travelX)/Math.max(.001,steps.reduce((s,d)=>s+d,0))>=.75 && coherent(first)) return accept(travelX);
    return null;
  }
}
