import { describe, it, expect } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Box3,
  Vector3,
} from "three";
import { prepareJewelry } from "./calibration";
import { defaultCalibration } from "./config";
describe("face jewelry calibration", () => {
  it("anchors the authored top centre regardless of model origin", () => {
    const model = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 4, 2), new MeshStandardMaterial());
    mesh.position.set(20, 40, 10);
    model.add(mesh);
    const attached = prepareJewelry(model, {
      ...defaultCalibration("earring"),
      height_mm: 40,
    });
    attached.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(attached);
    expect(bounds.max.y).toBeCloseTo(0);
    expect(bounds.min.y).toBeCloseTo(-0.25);
    expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0);
  });
  it("supports a saved centre anchor and rotation", () => {
    const model = new Mesh(
      new BoxGeometry(2, 4, 2),
      new MeshStandardMaterial(),
    );
    const config = {
      ...defaultCalibration("earring"),
      anchor: [0.5, 0.5, 0.5] as [number, number, number],
      rotation_deg: [0, 0, 90] as [number, number, number],
    };
    const group = prepareJewelry(model, config);
    group.updateMatrixWorld(true);
    expect(
      new Box3().setFromObject(group).getCenter(new Vector3()).length(),
    ).toBeCloseTo(0);
    expect(group.rotation.z).toBeCloseTo(Math.PI / 2);
  });
  it("rejects empty geometry instead of producing infinite model scale", () =>
    expect(() =>
      prepareJewelry(new Group(), defaultCalibration("earring")),
    ).toThrow());
  it("uses separate necklace placement and scale defaults", () => {
    expect(defaultCalibration("necklace").height_mm).toBeGreaterThan(
      defaultCalibration("earring").height_mm,
    );
    expect(defaultCalibration("necklace").offset_mm[1]).toBeLessThan(0);
  });
});
