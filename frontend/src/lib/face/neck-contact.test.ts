import { describe, it, expect } from "vitest";
import { Group, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { fitNeck, cameraPoint } from "./neck-fit";
import { neckSurface } from "./neck-surface";
import { createNeckOccluder, updateNeckOccluder } from "./neck-occlusion";
import type { BodyPose } from "./body-pose";

describe("observed neck edges versus rendered cutout", () => {
  it("keeps the cutout edges within two video pixels of measured sides, including yaw and roll", () => {
    const camera = new PerspectiveCamera(60, 640 / 480, 0.01, 100);
    camera.updateMatrixWorld(true);
    const viewport = { width: 640, height: 480 };
    for (const yaw of [0, 0.3])
      for (const roll of [0, 0.04])
        for (const row of [0.5, 0.65]) {
          const points = Array.from({ length: 33 }, () => ({
            x: 0.5,
            y: 0.4,
            z: 0,
            visibility: 1,
          }));
          points[11] = { x: 0.7, y: 0.6 - roll / 2, z: yaw / 2, visibility: 1 };
          points[12] = {
            x: 0.3,
            y: 0.6 + roll / 2,
            z: -yaw / 2,
            visibility: 1,
          };
          const pose: BodyPose = {
            points,
            width: 640,
            height: 480,
            time: 0,
            neck: { left: 0.39, right: 0.57, y: row },
          };
          const fit = fitNeck(pose, viewport, camera, 1, true)!;
          const group = new Group();
          group.position.copy(fit.position);
          group.quaternion.copy(fit.rotation);
          group.scale.setScalar(fit.mm);
          const mask = createNeckOccluder();
          updateNeckOccluder(mask, neckSurface(fit.radius, fit.height));
          group.add(mask);
          group.updateMatrixWorld(true);
          const inside = (x: number) => {
            const point = cameraPoint(
              { x, y: row, z: 0 },
              pose,
              viewport,
              camera,
              1,
              true,
            );
            return (
              new Raycaster(new Vector3(), point.normalize()).intersectObject(
                mask,
              ).length > 0
            );
          };
          const edge = (left: boolean) => {
            let lo = left ? 0 : 0.48,
              hi = left ? 0.48 : 1;
            for (let i = 0; i < 22; i++) {
              const mid = (lo + hi) / 2;
              if (inside(mid) === left) hi = mid;
              else lo = mid;
            }
            return (lo + hi) / 2;
          };
          expect(
            Math.abs(edge(true) - 0.39) * 640,
            `left yaw=${yaw} roll=${roll} row=${row}`,
          ).toBeLessThan(2);
          expect(
            Math.abs(edge(false) - 0.57) * 640,
            `right yaw=${yaw} roll=${roll} row=${row}`,
          ).toBeLessThan(2);
          mask.geometry.dispose();
          mask.material.dispose();
        }
  });
  it("does not force a visibly wide neck into the old fixed radius limit", () => {
    const camera = new PerspectiveCamera(60, 640 / 480, 0.01, 100);
    camera.updateMatrixWorld(true);
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.4,
      z: 0,
      visibility: 1,
    }));
    points[11].x = 0.7;
    points[12].x = 0.3;
    const fit = fitNeck(
      {
        points,
        width: 640,
        height: 480,
        time: 0,
        neck: { left: 0.41, right: 0.59, y: 0.5 },
      },
      { width: 640, height: 480 },
      camera,
      1,
      true,
    )!;
    expect(fit.radius).toBeGreaterThan(68);
    expect(neckSurface(fit.radius, fit.height).radius).toBe(fit.radius);
  });
});
