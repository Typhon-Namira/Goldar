import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { InstancedMesh, Matrix4, Vector3 } from "three";
import { NecklaceRig } from "./necklace-rig";
import { neckSurface, bodyFront } from "./neck-surface";
async function asset() {
  const data = readFileSync(
    new URL("../../../public/models/sample-necklace.glb", import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    "",
  );
}
describe("professional necklace asset and anatomical rig", () => {
  it("loads the real GLB with shared instanced links, faceted emerald, halo and clasp", async () => {
    const gltf = await asset();
    expect(gltf.scene.userData.goldarNecklaceRig).toBe(2);
    expect(
      (gltf.scene.getObjectByName("ChainLinks") as InstancedMesh)
        .isInstancedMesh,
    ).toBe(true);
    for (const name of [
      "DiamondHalo",
      "PearCutEmerald",
      "OpenworkBasket",
      "ArticulatedGoldBail",
      "ClaspAssembly",
    ])
      expect(gltf.scene.getObjectByName(name)).toBeDefined();
  });
  it("refits link matrices around narrow and wide necks without stretching the entire model", async () => {
    const gltf = await asset(),
      rig = new NecklaceRig(gltf.scene);
    const counts = [];
    for (const radius of [36, 68]) {
      const surface = neckSurface(radius, 80, 50);
      rig.update(surface);
      const chain = gltf.scene.getObjectByName("ChainLinks") as InstancedMesh;
      counts.push(chain.count);
      expect(chain.count).toBeLessThanOrEqual(384);
      expect(chain.count).toBeGreaterThan(100);
      for (let i = 0; i < chain.count; i++) {
        const matrix = new Matrix4();
        chain.getMatrixAt(i, matrix);
        const p = new Vector3()
          .setFromMatrixPosition(matrix)
          .multiplyScalar(1000);
        expect(matrix.elements.every(Number.isFinite)).toBe(true);
        if (p.z > 0 && p.y < -1)
          expect(p.z - bodyFront(surface, p.x, p.y)).toBeGreaterThan(2.9);
      }
      expect(rig.root.scale.x).toBe(1000);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });
});

describe("anatomical fit versus jewelry sizing", () => {
  it("keeps side contacts on the neck when pendant and link detail size changes", async () => {
    const gltf = await asset(),
      rig = new NecklaceRig(gltf.scene),
      surface = neckSurface(48, 80);
    const contacts = [];
    for (const scale of [0.7, 1, 1.3]) {
      rig.update(surface, scale);
      const chain = gltf.scene.getObjectByName("ChainLinks") as InstancedMesh;
      const matrix = new Matrix4();
      chain.getMatrixAt(0, matrix);
      contacts.push(new Vector3().setFromMatrixPosition(matrix));
    }
    expect(contacts[0].distanceTo(contacts[2])).toBeLessThan(1e-8);
  });
});
