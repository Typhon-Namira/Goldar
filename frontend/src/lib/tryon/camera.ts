import { Matrix4 } from "three";
import type { Intrinsics } from "./protocol";
export function coverProjection(c: Intrinsics, w: number, h: number) {
  const s = Math.max(w / c.width, h / c.height),
    fx = c.fx * s,
    fy = c.fy * s;
  const cx = c.cx * s + (w - c.width * s) / 2,
    cy = c.cy * s + (h - c.height * s) / 2,
    n = 0.005,
    f = 20;
  return new Matrix4().set(
    (2 * fx) / w,
    0,
    1 - (2 * cx) / w,
    0,
    0,
    (2 * fy) / h,
    (2 * cy) / h - 1,
    0,
    0,
    0,
    -(f + n) / (f - n),
    (-2 * f * n) / (f - n),
    0,
    0,
    -1,
    0,
  );
}
