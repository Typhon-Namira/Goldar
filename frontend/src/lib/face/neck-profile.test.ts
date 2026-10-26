import { describe, it, expect } from "vitest";
import { NeckProfileMemory } from "./neck-profile";
import type { BodyPose } from "./body-pose";
function pose(time: number): BodyPose {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.4,
    z: 0,
    visibility: 1,
  }));
  points[11].x = 0.7;
  points[12].x = 0.3;
  return { points, time, width: 640, height: 480 };
}
describe("person-specific neck proportions", () => {
  it("retains a fitted neck during skin occlusion and follows body translation", () => {
    const memory = new NeckProfileMemory();
    const first = pose(0);
    first.neck = { left: 0.45, right: 0.55, y: 0.35 };
    memory.apply(first);
    const next = pose(100);
    next.points[11].x += 0.1;
    next.points[12].x += 0.1;
    const fitted = memory.apply(next);
    expect(fitted.neck!.left).toBeCloseTo(0.55);
    expect(fitted.neck!.right).toBeCloseTo(0.65);
    expect(fitted.neck!.y).toBeCloseTo(0.35);
  });
  it("does not transfer an old neck fit after the body leaves the camera", () => {
    const memory = new NeckProfileMemory();
    const first = pose(0);
    first.neck = { left: 0.45, right: 0.55, y: 0.35 };
    memory.apply(first);
    expect(memory.apply(pose(2000)).neck).toBeUndefined();
  });
});

it("retains measured proportions across a long segmentation dropout while the same body remains tracked", () => {
  const memory = new NeckProfileMemory();
  const first = pose(0);
  first.neck = { left: 0.45, right: 0.55, y: 0.35 };
  memory.apply(first);
  for (let time = 100; time <= 15000; time += 100)
    expect(memory.apply(pose(time)).neck).toBeDefined();
  expect(memory.apply(pose(15100)).neck).toEqual(first.neck);
});


it("reacquires the contour when camera dimensions change instead of rotating old normalized proportions", () => {
  const memory = new NeckProfileMemory();
  const first = pose(0);
  first.neck = { left: 0.45, right: 0.55, y: 0.35 };
  memory.apply(first);
  const rotated = { ...pose(100), width: 480, height: 640 };
  expect(memory.apply(rotated).neck).toBeUndefined();
});


it("rejects one bad silhouette row after a stable measurement instead of moving onto the chest",()=>{
 const memory=new NeckProfileMemory(),first=pose(0);first.neck={left:.44,right:.56,y:.35};
 for(let i=0;i<4;i++)memory.apply({...first,time:i*100});
 const bad=pose(400);bad.neck={left:.42,right:.58,y:.55};
 expect(memory.apply(bad).neck!.y).toBeCloseTo(.35);
 expect(memory.apply(pose(500)).neck!.y).toBeCloseTo(.35);
});
