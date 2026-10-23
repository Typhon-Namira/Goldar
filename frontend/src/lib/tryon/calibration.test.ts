import { describe, it, expect } from "vitest";
import {
  Group,
  Mesh,
  TorusGeometry,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { inspectRingGeometry, attachCalibratedRing } from "../ringCalibration";
describe("model-independent ring calibration", () => {
  it("resolves the band in root coordinates without model-name constants", () => {
    const root = new Group(),
      band = new Mesh(
        new TorusGeometry(0.01, 0.002, 16, 64),
        new MeshStandardMaterial(),
      );
    band.name = "RingBand";
    band.position.set(0.02, 0.03, 0.01);
    band.scale.set(2, 2, 1);
    root.add(band);
    const c = inspectRingGeometry(root);
    expect(c.source).toBe("geometry");
    expect(c.center[0]).toBeCloseTo(0.02);
    expect(c.center[1]).toBeCloseTo(0.03);
    expect(c.innerDiameter).toBeCloseTo(0.032, 3);
    expect(Math.abs(c.holeAxis[2])).toBeCloseTo(1);
  });
  it("uses backend calibration to align the ring hole to the finger axis", () => {
    const model = new Group();
    model.add(
      new Mesh(new TorusGeometry(0.01, 0.002), new MeshStandardMaterial()),
    );
    const c = inspectRingGeometry(model, {
      center: [0.01, 0.02, 0.03],
      holeAxis: [1, 0, 0],
      stoneDirection: [0, 0, 1],
      innerDiameter: 0.018,
    });
    const fitted = attachCalibratedRing(model, c);
    expect(c.innerDiameter).toBe(0.018);
    expect(c.source).toBe("override");
    expect(
      new Vector3(1, 0, 0)
        .applyQuaternion(fitted.quaternion)
        .distanceTo(new Vector3(0, 1, 0)),
    ).toBeLessThan(1e-6);
    expect(model.position.toArray()).toEqual([-0.01, -0.02, -0.03]);
  });
});
