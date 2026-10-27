import { describe, it, expect } from "vitest";
import { AutoFramer, type FaceFrame } from "./auto-frame";
const face = (time: number, id = 1): FaceFrame => ({
  id,
  time,
  bounds: { x: 0.44, y: 0.18, width: 0.12, height: 0.18 },
  source: { x: 0.44, y: 0.18, width: 0.12, height: 0.18 },
  sourceWidth: 140,
  sourceHeight: 180,
  frontality: 1,
  quality: true,
});
function acquire(f: AutoFramer, start = 0, id = 1) {
  for (let time = start; time <= start + 700; time += 100)
    f.observe(face(time, id));
}
describe("stable single-visitor automatic framing", () => {
  it("requires a sustained, sufficiently detailed, well-lit focused face before zooming", () => {
    for (const change of ["pixels", "quality", "yaw", "edge"]) {
      const f = new AutoFramer();
      for (let t = 0; t < 1200; t += 100) {
        const v = face(t);
        if (change === "pixels") v.sourceWidth = 40;
        if (change === "quality") v.quality = false;
        if (change === "yaw") v.frontality = 0.5;
        if (change === "edge") v.bounds.x = 0.01;
        f.observe(v);
      }
      expect(f.ownerId()).toBeNull();
      expect(f.update(1300).scale).toBe(1);
    }
    const f = new AutoFramer();
    f.observe(face(0));
    f.observe(face(200));
    expect(f.ownerId()).toBeNull();
    acquire(f, 300);
    expect(f.ownerId()).toBe(1);
    expect(f.update(1100).scale).toBeGreaterThan(1);
  });
  it("holds EXACTLY the same crop under ordinary landmark and pose jitter", () => {
    const f = new AutoFramer();
    acquire(f);
    for (let t = 800; t <= 1700; t += 100) f.observe(face(t));
    const fixed = f.update(1700);
    for (let i = 0; i < 300; i++) {
      const v = face(1716 + i * 16);
      v.bounds.x += Math.sin(i) * 0.009;
      v.bounds.y += Math.cos(i) * 0.009;
      v.bounds.width += Math.sin(i) * 0.006;
      v.bounds.height += Math.cos(i) * 0.009;
      f.observe(v);
      expect(f.update(v.time)).toEqual(fixed);
    }
  });
  it("never switches a locked crop to a second ID and returns wide before acquiring the next visitor", () => {
    const f = new AutoFramer();
    acquire(f);
    f.observe(face(1100));
    expect(f.observe(face(1200, 2))).toBe(false);
    expect(f.ownerId()).toBe(1);
    f.update(2400);
    expect(f.phase()).toBe("returning");
    expect(f.observe(face(2500, 2))).toBe(false);
    expect(f.update(3100)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(f.ownerId()).toBeNull();
    acquire(f, 3500, 2);
    expect(f.ownerId()).toBe(2);
  });
  it("bridges short face-tracking dropouts without zoom pumping", () => {
    const f = new AutoFramer();
    acquire(f);
    for (let t = 800; t <= 1700; t += 100) f.observe(face(t));
    const crop = f.update(1700);
    expect(f.update(2600)).toEqual(crop);
    expect(f.phase()).toBe("focused");
    f.observe(face(2650));
    expect(f.update(2700)).toEqual(crop);
  });
  it("rejects a substituted face position under a reused ID", () => {
    const f = new AutoFramer();
    acquire(f);
    const jump = face(800);
    jump.bounds.x = 0.75;
    expect(f.observe(jump)).toBe(false);
    expect(f.ownerId()).toBe(1);
  });
  it("pans only after a substantial displacement and changes scale only for a sustained close approach", () => {
    const f = new AutoFramer();
    acquire(f);
    for (let t = 800; t <= 1700; t += 100) f.observe(face(t));
    const original = f.update(1700);
    for (let t = 1800; t <= 2600; t += 100) {
      const v = face(t);
      v.bounds.x = 0.56;
      f.observe(v);
      f.update(t);
    }
    const moved = f.update(2600);
    expect(moved.scale).toBe(original.scale);
    expect(moved.x).toBeLessThan(original.x);
    for (let t = 2700; t <= 4200; t += 100) {
      const v = face(t);
      v.bounds.x = 0.5;
      v.bounds.height = 0.28;
      v.bounds.width = 0.19;
      f.observe(v);
      f.update(t);
    }
    expect(f.update(4200).scale).toBeLessThan(original.scale);
  });
  it("keeps the crop in bounds and gates hands/body to the active visitor", () => {
    const f = new AutoFramer();
    expect(f.allowsHand(0.5, 0.5, 0)).toBe(false);
    acquire(f);
    for (let t = 800; t <= 1700; t += 100) f.observe(face(t));
    const crop = f.update(1700);
    expect(crop.x).toBeLessThanOrEqual(0);
    expect(crop.x).toBeGreaterThanOrEqual(1 - crop.scale);
    expect(crop.y).toBeLessThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(1 - crop.scale);
    expect(f.allowsHand(0.5, 0.6, 1700)).toBe(true);
    expect(f.allowsHand(0.99, 0.6, 1700)).toBe(false);
    expect(
      f.matchesBody({ x: 0.35, y: 0.55 }, { x: 0.65, y: 0.55 }, 1700),
    ).toBe(true);
    expect(
      f.matchesBody({ x: 0.75, y: 0.55 }, { x: 0.99, y: 0.55 }, 1700),
    ).toBe(false);
  });
});
