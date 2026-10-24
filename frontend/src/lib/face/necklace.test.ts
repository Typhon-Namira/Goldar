import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Box3, Raycaster, Vector3 } from "three";
import { createNeckOccluder } from "./neck-occlusion";
import { defaultCalibration, resolveCalibration } from "./config";

describe("necklace placement compatibility", () => {
  const old = {
    ...defaultCalibration("necklace"),
    height_mm: 180,
    offset_mm: [0, -45, 10] as [number, number, number],
  };
  it("upgrades an unchanged old sample without a database write", () => {
    const product = {
      category: "necklace",
      glb_url: "/models/sample-necklace.glb",
      face_calibration: old,
    };
    const config = resolveCalibration(product);
    expect(config.height_mm).toBe(85);
    expect(config.offset_mm).toEqual([0, -10, 40]);
    expect(old.height_mm).toBe(180);
  });
  it("preserves merchant models and customized sample calibration", () => {
    expect(
      resolveCalibration({
        category: "necklace",
        glb_url: "https://merchant.test/model.glb",
        face_calibration: old,
      }),
    ).toBe(old);
    const custom = { ...old, height_mm: 150 };
    expect(
      resolveCalibration({
        category: "necklace",
        glb_url: "/models/sample-necklace.glb",
        face_calibration: custom,
      }),
    ).toBe(custom);
  });
});

describe("neck depth occlusion", () => {
  it("occludes rear arc behind the measured neck, preserving front drape", () => {
    const mask = createNeckOccluder();
    mask.updateMatrixWorld(true);
    const hit = new Raycaster(
      new Vector3(0, 30, 200),
      new Vector3(0, 0, -1),
    ).intersectObject(mask)[0];
    expect(hit.point.z).toBeGreaterThan(0);
    expect(hit.point.z).toBeLessThan(42);
    expect(mask.material.colorWrite).toBe(false);
    const bounds = new Box3().setFromObject(mask);
    expect(bounds.max.y).toBeCloseTo(90);
    expect(bounds.min.y).toBeCloseTo(-150);
    // Chest depth is now shared with the route, never an unrelated cutout.
    mask.geometry.dispose();
    mask.material.dispose();
  });
  it("preserves rear arc when viewed from behind", () => {
    const mask = createNeckOccluder();
    mask.updateMatrixWorld(true);
    const hit = new Raycaster(
      new Vector3(0, 30, -200),
      new Vector3(0, 0, 1),
    ).intersectObject(mask)[0];
    expect(hit.point.z).toBeLessThan(0);
    expect(hit.point.z).toBeGreaterThan(-42);
    mask.geometry.dispose();
    mask.material.dispose();
  });
  it("ships a genuinely volumetric chain with front drape and rear neck arc", () => {
    const glb = readFileSync(
      new URL("../../../public/models/sample-necklace.glb", import.meta.url),
    );
    const jsonLength = glb.readUInt32LE(12);
    const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    expect(document.scenes[0].extras.goldarNecklaceRig).toBe(2);
    const chain = document.nodes.find(
      (node: { name: string }) => node.name === "ChainLinks",
    );
    const translations =
      document.accessors[
        chain.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION
      ];
    expect(translations.max[2] - translations.min[2]).toBeGreaterThan(0.08);
    expect(translations.max[1] - translations.min[1]).toBeGreaterThan(0.055);
    expect(
      document.nodes.some(
        (node: { name: string }) => node.name === "PearCutEmerald",
      ),
    ).toBe(true);
    expect(
      document.nodes.some(
        (node: { name: string }) => node.name === "DiamondHalo",
      ),
    ).toBe(true);
  });
});
