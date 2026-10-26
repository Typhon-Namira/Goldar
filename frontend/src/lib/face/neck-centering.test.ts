import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Group, PerspectiveCamera, Vector3, Raycaster } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitNeck } from "./neck-fit";
import { NecklaceRig } from "./necklace-rig";
import { chainPoint, neckSurface } from "./neck-surface";
import { createNeckOccluder, updateNeckOccluder } from "./neck-occlusion";

describe("centred gravity drape", () => {
  it("keeps the actual GLB pendant on the neck image centreline despite shoulder depth and height asymmetry", async () => {
    const data = readFileSync(
      new URL("../../../public/models/sample-necklace.glb", import.meta.url),
    );
    const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
    const rig = new NecklaceRig(gltf.scene);
    const camera = new PerspectiveCamera(60, 4 / 3, 0.01, 100);
    camera.updateMatrixWorld(true);
    for (const mirrored of [false, true])
      for (const depthDifference of [-0.3, 0, 0.3])
        for (const shoulderLift of [-0.07, 0.07])
          for (const centreX of [0.44, 0.56]) {
          const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.4, z: 0, visibility: 1 }));
          points[11] = { x: 0.7, y: 0.65 + shoulderLift, z: depthDifference / 2, visibility: 1 };
          points[12] = { x: 0.3, y: 0.65 - shoulderLift, z: -depthDifference / 2, visibility: 1 };
          // Correct anatomical ordering for each camera view.
          if (!mirrored) [points[11], points[12]] = [points[12], points[11]];
          const fit = fitNeck({ points, width: 640, height: 480, time: 0, neck: { left: centreX - 0.09, right: centreX + 0.09, y: 0.5 } }, { width: 400, height: 800 }, camera, 1, mirrored)!;
          const up = new Vector3(0, 1, 0).applyQuaternion(fit.rotation);
          expect(up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-10);
          const group = new Group();
          group.position.copy(fit.position);
          group.quaternion.copy(fit.rotation);
          group.scale.setScalar(fit.mm);
          const bearing = camera.getWorldPosition(new Vector3()).sub(fit.position).applyQuaternion(fit.rotation.clone().invert());
          const surface = neckSurface(fit.radius, fit.height);
          surface.viewDirection = [bearing.x, bearing.z];
          rig.update(surface);
          group.add(rig.root);
          group.updateMatrixWorld(true);
          const pendant = rig.root.getObjectByName("PendantAssembly")!;
          const projected = pendant.getWorldPosition(new Vector3()).project(camera);
          const centre = fit.position.clone().project(camera);
          expect(Math.abs(projected.x - centre.x) * 400 / 2).toBeLessThan(1);
          expect(projected.y).toBeLessThan(centre.y);
          group.remove(rig.root);
        }
  });
  it("retains one connected visible arc and hidden rear links after recentering", () => {
    const mask = createNeckOccluder();
    for (const yaw of [-0.8, 0, 0.8]) {
      const view = new Vector3(Math.sin(yaw), 0.15, Math.cos(yaw)).normalize();
      const surface = neckSurface(60, 75, 50);
      surface.viewDirection = [view.x, view.z];
      updateNeckOccluder(mask, surface);
      mask.updateMatrixWorld(true);
      const visible = Array.from({ length: 128 }, (_, i) => {
        const p = new Vector3(...chainPoint(surface, i / 128));
        const hits = new Raycaster(p.clone().addScaledVector(view, 400), view.clone().negate()).intersectObject(mask);
        return !hits.length || hits[0].distance >= 399.8;
      });
      expect(visible[32]).toBe(true);
      expect(visible[96]).toBe(false);
      expect(visible.filter((v, i) => v !== visible[(i + 1) % 128]).length).toBe(2);
    }
    mask.geometry.dispose();
    mask.material.dispose();
  });
});
