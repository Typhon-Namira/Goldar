import { describe, it, expect } from "vitest";
import { HandSwipeDetector } from "./hand-swipe";
export const hand = (x = 0.5, y = 0.4) => [
  Array.from({ length: 21 }, (_, i) => ({
    x: x + ((i % 5) - 2) * 0.015,
    y: y + Math.floor(i / 5) * 0.02,
    z: 0,
  })),
];
describe("vertical, contactless product scrolling", () => {
  it("maps down to the lower product and up to the upper product in either camera mirror mode", () => {
    for (const mirrored of [true, false])
      for (const sign of [-1, 1]) {
        const d = new HandSwipeDetector();
        expect(d.update(hand(), 0, mirrored)).toBeNull();
        expect(d.update(hand(0.5, 0.4 + 0.16 * sign), 60, mirrored)).toBe(sign);
      }
  });
  it("recognizes a short two-frame flick without a dwell or three-frame requirement", () => {
    const d = new HandSwipeDetector();
    d.update(hand(0.5, 0.3), 0);
    expect(d.update(hand(0.5, 0.37), 35)).toBe(1);
  });
  it("recognizes a very fast coherent swipe and bridges one missing/blurred frame", () => {
    const fast = new HandSwipeDetector();
    fast.update(hand(0.5, 0.2), 0);
    expect(fast.update(hand(0.5, 0.65), 40)).toBe(1);
    const missing = new HandSwipeDetector();
    missing.update(hand(0.5, 0.3), 0);
    missing.update([], 50);
    expect(missing.update(hand(0.5, 0.49), 120)).toBe(1);
  });
  it("consumes a long downward sweep once", () => {
    const d = new HandSwipeDetector(),
      outputs = [];
    for (let i = 0; i < 13; i++)
      outputs.push(d.update(hand(0.5, 0.12 + i * 0.055), i * 60));
    expect(outputs.filter(Boolean)).toEqual([1]);
  });
  it("accepts a deliberate reverse swipe after 180ms", () => {
    const d = new HandSwipeDetector();
    d.update(hand(0.5, 0.3), 0);
    expect(d.update(hand(0.5, 0.43), 60)).toBe(1);
    d.update(hand(0.5, 0.46), 100);
    d.update(hand(0.5, 0.46), 170);
    d.update(hand(0.5, 0.46), 240);
    expect(d.update(hand(0.5, 0.32), 270)).toBe(-1);
  });
  it("does not replay the settled tail, but accepts a new downward gesture after a brief pause", () => {
    const d = new HandSwipeDetector();
    d.update(hand(0.5, 0.3), 0);
    expect(d.update(hand(0.5, 0.45), 60)).toBe(1);
    for (const [t, y] of [
      [120, 0.53],
      [180, 0.58],
      [240, 0.6],
      [300, 0.6],
      [360, 0.6],
      [420, 0.6],
      [500, 0.6],
    ])
      expect(d.update(hand(0.5, y), t)).toBeNull();
    expect(d.update(hand(0.5, 0.72), 550)).toBe(1);
  });
  it("rejects horizontal swipes, jitter, implausible jumps and broken palm geometry", () => {
    for (const kind of ["noise", "horizontal", "jump", "shape"]) {
      const d = new HandSwipeDetector();
      d.update(hand(0.3, 0.3), 0);
      const next = hand(
        kind === "horizontal" ? 0.55 : 0.3,
        kind === "noise" ? 0.31 : kind === "jump" ? 0.95 : 0.46,
      );
      if (kind === "shape") next[0][5].x += 0.4;
      expect(d.update(next, kind === "jump" ? 20 : 90)).toBeNull();
    }
  });
  it("rejects disconnected, repeated-timestamp and malformed observations", () => {
    const d = new HandSwipeDetector();
    expect(d.update([[{ x: NaN, y: 0 }]], 0)).toBeNull();
    d.update(hand(0.5, 0.3), 100);
    expect(d.update(hand(0.5, 0.6), 1000)).toBeNull();
    expect(d.update(hand(0.5, 0.8), 1000)).toBeNull();
  });
  it("recognizes a slower deliberate gesture", () => {
    const d = new HandSwipeDetector();
    d.update(hand(0.5, 0.3), 0);
    d.update(hand(0.5, 0.326), 160);
    expect(d.update(hand(0.5, 0.355), 320)).toBe(1);
  });
  it("uses physical image axes consistently across portrait, landscape and wide cameras", () => {
    for (const aspect of [0.5625, 1, 16 / 9, 2.4]) {
      const d = new HandSwipeDetector();
      d.update(hand(0.5, 0.3), 0, true, aspect);
      expect(d.update(hand(0.5, 0.44), 70, true, aspect)).toBe(1);
    }
  });
  it("allows a natural wrist rotation during a quick swipe", () => {
    const d = new HandSwipeDetector();
    d.update(hand(), 0);
    const rotated = hand(0.5, 0.55);
    const angle = 0.6,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const cx = rotated[0].reduce((sum, p) => sum + p.x, 0) / 21,
      cy = rotated[0].reduce((sum, p) => sum + p.y, 0) / 21;
    for (const p of rotated[0]) {
      const x = p.x - cx,
        y = p.y - cy;
      p.x = cx + x * c - y * s;
      p.y = cy + x * s + y * c;
    }
    expect(d.update(rotated, 70)).toBe(1);
  });
  it("tracks the moving hand independently of a larger stationary hand and result ordering", () => {
    const d = new HandSwipeDetector(),
      stationary = hand(0.72, 0.4)[0];
    d.update([stationary, hand(0.3, 0.25)[0]], 0, false, 1, ["Left", "Right"]);
    expect(
      d.update([hand(0.3, 0.4)[0], stationary], 60, false, 1, [
        "Right",
        "Left",
      ]),
    ).toBe(1);
  });
  it("does not join one hand disappearing with another hand appearing", () => {
    const d = new HandSwipeDetector();
    d.update(hand(0.5, 0.3), 0, false, 1, ["Left"]);
    expect(d.update(hand(0.5, 0.5), 70, false, 1, ["Right"])).toBeNull();
  });
  it("does not emit twice when both hands sweep together", () => {
    const d = new HandSwipeDetector();
    d.update([hand(0.25, 0.2)[0], hand(0.75, 0.2)[0]], 0, false, 1, [
      "Left",
      "Right",
    ]);
    expect(
      d.update([hand(0.25, 0.4)[0], hand(0.75, 0.4)[0]], 60, false, 1, [
        "Left",
        "Right",
      ]),
    ).toBe(1);
    expect(
      d.update([hand(0.25, 0.6)[0], hand(0.75, 0.6)[0]], 260, false, 1, [
        "Left",
        "Right",
      ]),
    ).toBeNull();
  });
  it("does not accumulate stationary hand jitter into scrolling", () => {
    const d = new HandSwipeDetector();
    for (let i = 0; i < 240; i++)
      expect(
        d.update(
          hand(0.5 + Math.sin(i) * 0.004, 0.4 + Math.cos(i) * 0.004),
          i * 33,
        ),
      ).toBeNull();
  });
});

it("keeps coherent vertical input usable on low-FPS displays instead of resetting on every inference", () => {
  const d = new HandSwipeDetector();
  d.update(hand(0.4, 0.25), 0, false, 4 / 3, ["Left"]);
  d.update(hand(0.4, 0.25), 280, false, 4 / 3, ["Left"]);
  expect(d.update(hand(0.4, 0.48), 560, false, 4 / 3, ["Left"])).toBe(1);
  expect(d.update(hand(0.4, 0.55), 840, false, 4 / 3, ["Left"])).toBeNull();
});

it("does not turn a late overlapping duplicate palm detection into a second selection", () => {
  const d = new HandSwipeDetector();
  d.update(hand(0.5, 0.2), 0, false, 1, ["Left"]);
  expect(d.update(hand(0.5, 0.4), 60, false, 1, ["Left"])).toBe(1);
  expect(
    d.update([hand(0.5, 0.5)[0], hand(0.505, 0.48)[0]], 200, false, 1, [
      "Left",
      "Right",
    ]),
  ).toBeNull();
  expect(
    d.update([hand(0.5, 0.6)[0], hand(0.505, 0.6)[0]], 320, false, 1, [
      "Left",
      "Right",
    ]),
  ).toBeNull();
});

it("retains the consumed-sweep latch through a crop/handedness reacquisition", () => {
  const d = new HandSwipeDetector();
  d.update(hand(0.5, 0.2), 0, false, 1, ["Left"]);
  expect(d.update(hand(0.5, 0.4), 60, false, 1, ["Left"])).toBe(1);
  expect(d.update(hand(0.5, 0.41), 120, false, 1, ["Right"])).toBeNull();
  expect(d.update(hand(0.5, 0.55), 280, false, 1, ["Right"])).toBeNull();
  d.update(hand(0.5, 0.55), 400, false, 1, ["Right"]);
  d.update(hand(0.5, 0.55), 500, false, 1, ["Right"]);
  expect(d.update(hand(0.5, 0.7), 560, false, 1, ["Right"])).toBe(1);
});
