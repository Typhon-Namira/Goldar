import { it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import { projectFace } from "./face-projection";
import type { FaceData } from "../face/types";
function face(): FaceData {
  return {
    id: 1,
    transform: {
      position: { x: 0, y: 0, z: -1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1,
      scaledWidth: 1,
    },
    attachmentPoints: {},
    vertices: Array.from({ length: 40 }, (_, i) => ({
      x: Math.cos((i * Math.PI) / 20) * 0.1,
      y: Math.sin((i * Math.PI) / 20) * 0.14,
      z: 0,
    })),
  };
}
it("keeps source quality dimensions consistent through cover crop, mirroring and render resolution", () => {
  const camera = new PerspectiveCamera(60, 1, 0.01, 10);
  camera.updateMatrixWorld(true);
  const a = projectFace(
    face(),
    camera,
    { width: 500, height: 500 },
    { width: 1280, height: 720 },
    true,
    0,
  )!;
  const b = projectFace(
    face(),
    camera,
    { width: 1000, height: 1000 },
    { width: 1280, height: 720 },
    false,
    0,
  )!;
  expect(a.sourceWidth).toBeCloseTo(b.sourceWidth);
  expect(a.sourceHeight).toBeCloseTo(b.sourceHeight);
  expect(a.sourceWidth).toBeGreaterThan(100);
  expect(a.frontality).toBeCloseTo(1);
  expect(a.bounds).toEqual(b.bounds);
});
it("does not treat absent/nonfinite geometry as a high-quality face", () => {
  const camera = new PerspectiveCamera(60, 1, 0.01, 10);
  camera.updateMatrixWorld(true);
  const f = face();
  f.vertices = [];
  expect(
    projectFace(
      f,
      camera,
      { width: 500, height: 500 },
      { width: 1280, height: 720 },
      true,
      0,
    ),
  ).toBeNull();
});
