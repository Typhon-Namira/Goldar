import { describe, it, expect } from "vitest";
import { Raycaster, Vector3 } from "three";
import {
  chainPoint,
  neckSurface,
  bodyFront,
  bodySection,
} from "./neck-surface";
import { createNeckOccluder, updateNeckOccluder } from "./neck-occlusion";
describe("shared necklace contact surface", () => {
  it("keeps every front-chain centre outside the same neck/chest used for depth", () => {
    for (const radius of [36, 48, 68])
      for (const drop of [28, 50, 85]) {
        const surface = neckSurface(radius, 75, drop);
        for (let i = 0; i <= 256; i++) {
          const [x, y, z] = chainPoint(surface, i / 512);
          if (y < -0.01 && Math.abs(x) < bodySection(surface, y).radius)
            expect(z - bodyFront(surface, x, y)).toBeGreaterThanOrEqual(2.999);
        }
      }
  });
  it("produces a connected visible chain, without isolated gold fragments, from front and oblique views", () => {
    const mask = createNeckOccluder();
    for (const radius of [36, 48, 68])
      for (const yaw of [-0.8, 0, 0.8, Math.PI]) {
        const surface = neckSurface(radius, 75, 50);
        updateNeckOccluder(mask, surface);
        mask.updateMatrixWorld(true);
        const view = new Vector3(Math.sin(yaw), 0.2, Math.cos(yaw)).normalize();
        const visibility = [];
        for (let i = 0; i < 128; i++) {
          const point = new Vector3(...chainPoint(surface, i / 128));
          const hits = new Raycaster(
            point.clone().addScaledVector(view, 400),
            view.clone().negate(),
          ).intersectObject(mask);
          visibility.push(!hits.length || hits[0].distance >= 399.8);
        }
        let transitions = 0;
        for (let i = 0; i < 128; i++)
          if (visibility[i] !== visibility[(i + 1) % 128]) transitions++;
        expect(transitions, `radius ${radius}, yaw ${yaw}`).toBe(2);
        expect(visibility[32]).toBe(Math.cos(yaw) > 0); // pendant/front chain
        expect(visibility[96]).toBe(Math.cos(yaw) < 0); // rear arc
      }
    mask.geometry.dispose();
    mask.material.dispose();
  });
  it("closes the route and keeps the collar contact at the measured side radius", () => {
    const surface = neckSurface(48, 90);
    expect(
      new Vector3(...chainPoint(surface, 0)).distanceTo(
        new Vector3(...chainPoint(surface, 1)),
      ),
    ).toBeLessThan(1e-10);
    expect(chainPoint(surface, 0)[0]).toBe(51);
    expect(chainPoint(surface, 0.5)[0]).toBeCloseTo(-51);
  });
});
