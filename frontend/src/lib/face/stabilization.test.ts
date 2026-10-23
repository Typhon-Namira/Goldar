import { describe, expect, it } from "vitest";
import { LobeStabilizer } from "./stabilization";
import {
  createLobeOccluder,
  PIERCING_INSET_MM,
  LobeSurface,
} from "./ear-occlusion";

describe("ear stability", () => {
  it("reduces stationary detector jitter", () => {
    const filter = new LobeStabilizer();
    let variance = 0;
    for (let i = 0; i < 120; i++) {
      const filtered = filter.update(
        { x: i % 2 ? 1 : -1, y: 0, z: 0 },
        (i * 1000) / 30,
      );
      if (i > 30) variance += filtered.x ** 2;
    }
    expect(Math.sqrt(variance / 89)).toBeLessThan(0.25);
  });
  it("follows intentional movement without prolonged lag", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 0, y: 0, z: 0 }, 0);
    let value;
    for (let i = 1; i <= 6; i++)
      value = filter.update({ x: 12, y: 0, z: 0 }, (i * 1000) / 30);
    expect(value!.x).toBeGreaterThan(10);
  });
  it("reacquires directly after a gap or visibility reset", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 0, y: 0, z: 0 }, 0);
    expect(filter.update({ x: 20, y: 0, z: 0 }, 400).x).toBe(20);
    filter.reset();
    expect(filter.update({ x: -10, y: 0, z: 0 }, 433).x).toBe(-10);
  });
});

describe("piercing depth", () => {
  it("writes only tissue depth and intersects the inserted model top", () => {
    const mask = createLobeOccluder();
    expect(mask.material.colorWrite).toBe(false);
    expect(mask.material.depthWrite).toBe(true);
    expect(mask.renderOrder).toBeLessThan(0);
    expect(PIERCING_INSET_MM).toBeGreaterThan(mask.position.y - mask.scale.y);
    expect(PIERCING_INSET_MM).toBeLessThan(mask.position.y + mask.scale.y);
    expect(PIERCING_INSET_MM - 15).toBeLessThan(mask.position.y - mask.scale.y);
    mask.geometry.dispose();
    mask.material.dispose();
  });
});

describe("robust anatomical stabilization", () => {
  it("rejects isolated large landmark spikes", () => {
    const filter = new LobeStabilizer();
    for (let i = 0; i < 10; i++) filter.update({ x: 0, y: 0, z: 0 }, i * 33);
    const spike = filter.update({ x: 25, y: -18, z: 20 }, 330);
    expect(spike.length()).toBeLessThan(0.1);
    expect(filter.update({ x: 0, y: 0, z: 0 }, 363).length()).toBeLessThan(0.1);
  });
  it("bridges a brief detector loss but never persists after sustained loss", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 70, y: -20, z: 0 }, 100);
    expect(filter.hold(170)?.x).toBe(70);
    expect(filter.hold(200)).toBeUndefined();
    filter.reset();
    expect(filter.hold(170)).toBeUndefined();
  });
  it("does not random-walk under sustained submillimetre noise", () => {
    const filter = new LobeStabilizer();
    filter.update({ x: 0, y: 0, z: 0 }, 0);
    for (let i = 1; i < 1000; i++) {
      const point = { x: Math.sin(i) * 0.3, y: Math.cos(i) * 0.3, z: 0 };
      expect(filter.update(point, i * 33).length()).toBe(0);
    }
  });
});

describe("landmark fitted ear tissue", () => {
  const lobe = { x: 70, y: -20, z: -5 };
  it("starts tissue at the lobe instead of cutting below it", () => {
    const surface = new LobeSurface();
    surface.update(lobe, undefined, undefined, 0);
    expect(surface.mesh.position.y - surface.mesh.scale.y).toBe(0);
    const position = surface.mesh.geometry.getAttribute("position");
    let minY = Infinity;
    for (let i = 0; i < position.count; i++)
      minY = Math.min(minY, position.getY(i));
    expect(minY).toBeCloseTo(-1);
  });
  it("fits orientation and lobe size using canal and helix landmarks", () => {
    const surface = new LobeSurface();
    const inset = surface.update(
      lobe,
      { x: 74, y: -2, z: -4 },
      { x: 80, y: 25, z: -6 },
      0,
    );
    expect(
      surface.group.quaternion.angleTo(new LobeSurface().group.quaternion),
    ).toBeGreaterThan(0.1);
    expect(surface.mesh.scale.y).toBeGreaterThan(5);
    expect(inset.length()).toBeGreaterThanOrEqual(2.5);
    expect(inset.length()).toBeLessThanOrEqual(4.001);
    const frame = surface.group.quaternion.clone();
    const size = surface.mesh.scale.clone();
    surface.update(lobe, undefined, undefined, 33);
    expect(surface.group.quaternion.angleTo(frame)).toBeLessThan(1e-6);
    expect(surface.mesh.scale.distanceTo(size)).toBe(0);
  });
  it("rejects implausible or collinear landmarks without invalid transforms", () => {
    const surface = new LobeSurface();
    surface.update(lobe, { x: 0, y: 500, z: 0 }, undefined, 0);
    expect(surface.mesh.scale.y).toBe(5);
    surface.update(lobe, { x: 70, y: 0, z: -5 }, { x: 70, y: 30, z: -5 }, 33);
    expect(surface.group.quaternion.toArray().every(Number.isFinite)).toBe(
      true,
    );
    expect(surface.mesh.scale.toArray().every((v) => v > 0)).toBe(true);
  });
  it("smooths shape corrections and resets between different faces", () => {
    const surface = new LobeSurface();
    surface.update(lobe, undefined, undefined, 0);
    surface.update(lobe, { x: 76, y: 3, z: -4 }, { x: 80, y: 25, z: -6 }, 33);
    expect(surface.mesh.scale.y).toBeLessThan(6);
    surface.reset();
    surface.update(lobe, undefined, undefined, 100);
    expect(surface.mesh.scale.y).toBe(5);
    expect(surface.group.quaternion.w).toBe(1);
  });
});
