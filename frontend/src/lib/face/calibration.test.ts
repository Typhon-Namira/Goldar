import { describe, it, expect, vi } from "vitest";
import {
  Texture,
  DataTexture,
  InstancedMesh,
  SkinnedMesh,
  Skeleton,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Box3,
  Vector3,
} from "three";
import { prepareJewelry, disposeModel } from "./calibration";
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

it("releases shared model resources once, including GPU instance and bone buffers", () => {
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const model = new Group();
  const instance = new InstancedMesh(geometry, material, 1);
  const skin = new SkinnedMesh(geometry, material);
  skin.skeleton = new Skeleton();
  const boneTexture = new DataTexture();
  skin.skeleton.boneTexture = boneTexture;
  model.add(instance, skin);
  const clone = model.clone();
  const callbacks = [geometry, texture, material, instance, boneTexture].map((resource) => {
    const handler = vi.fn();
    resource.addEventListener("dispose", handler);
    return handler;
  });
  disposeModel(model, clone);
  callbacks.forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
  expect(skin.skeleton.boneTexture).toBeNull();
});
