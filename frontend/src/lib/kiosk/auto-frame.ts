export type FrameBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type FaceFrame = {
  id: number;
  bounds: FrameBounds;
  source: FrameBounds;
  sourceWidth: number;
  sourceHeight: number;
  frontality: number;
  quality: boolean;
  time: number;
};
export type Crop = { scale: number; x: number; y: number };
export type FrameState = "wide" | "acquiring" | "focused" | "returning";
const wide = (): Crop => ({ scale: 1, x: 0, y: 0 });
const centre = (b: FrameBounds) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function crop(face: FrameBounds, scale: number): Crop {
  const c = centre(face);
  return {
    scale,
    x: clamp(0.44 - scale * c.x, 1 - scale, 0),
    y: clamp(0.34 - scale * c.y, 1 - scale, 0),
  };
}
function usable(f: FaceFrame) {
  const b = f.bounds,
    c = centre(b);
  return (
    [
      f.id,
      b.x,
      b.y,
      b.width,
      b.height,
      f.sourceWidth,
      f.sourceHeight,
      f.frontality,
      f.time,
    ].every(Number.isFinite) &&
    b.width > 0 &&
    b.height > 0 &&
    b.x >= 0.01 &&
    b.y >= 0.01 &&
    b.x + b.width <= 0.99 &&
    b.y + b.height <= 0.98 &&
    c.x >= 0.22 &&
    c.x <= 0.76 &&
    c.y >= 0.07 &&
    c.y <= 0.72 &&
    f.sourceWidth >= 80 &&
    f.sourceHeight >= 96 &&
    f.frontality >= 0.78 &&
    f.quality
  );
}
/** Anonymous single-visitor framing. Scale is latched for a visit, with a wide
 * pan deadband; small landmark/pose changes never change the crop. */
export class AutoFramer {
  private owner: number | null = null;
  private state: FrameState = "wide";
  private candidates: FaceFrame[] = [];
  private lastSeen = -Infinity;
  private latest: FaceFrame | null = null;
  private value: Crop = wide();
  private animation: {
    from: Crop;
    to: Crop;
    at: number;
    duration: number;
  } | null = null;
  private cooldown = -Infinity;
  private largeSince: number | null = null;
  accepts(id: number) {
    return (
      this.state !== "returning" && (this.owner === null || id === this.owner)
    );
  }
  ownerId() {
    return this.owner;
  }
  phase() {
    return this.state;
  }
  sourceBounds() {
    return this.latest?.source ?? null;
  }
  private transition(to: Crop, at: number, duration: number) {
    this.animation = { from: { ...this.value }, to, at, duration };
  }
  observe(f: FaceFrame): boolean {
    const now = f.time;
    this.update(now);
    if (!this.accepts(f.id)) return false;
    const b = f.bounds,
      c = centre(b);
    if (this.owner !== null) {
      const previous = this.latest;
      // Do not carry a zoom to a newly substituted face even if an SDK ID is reused.
      if (
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.width <= 0 ||
        b.height <= 0 ||
        c.x < 0.15 ||
        c.x > 0.85 ||
        c.y < 0.02 ||
        c.y > 0.85 ||
        f.sourceWidth < 44 ||
        (previous &&
          (Math.hypot(
            c.x - centre(previous.bounds).x,
            c.y - centre(previous.bounds).y,
          ) > Math.max(0.16, previous.bounds.width * 1.3) ||
            b.height / previous.bounds.height > 1.8 ||
            b.height / previous.bounds.height < 0.55))
      )
        return false;
      this.latest = f;
      this.lastSeen = now;
      if (!this.animation) {
        const screen = {
          x: this.value.scale * c.x + this.value.x,
          y: this.value.scale * c.y + this.value.y,
        };
        if (
          b.height * this.value.scale > 0.5 ||
          b.width * this.value.scale > 0.66
        ) {
          this.largeSince ??= now;
          if (now - this.largeSince > 500) {
            this.transition(
              crop(
                b,
                Math.max(
                  1,
                  Math.min(this.value.scale, 0.34 / b.height, 0.44 / b.width),
                ),
              ),
              now,
              800,
            );
            this.largeSince = null;
          }
        } else this.largeSince = null;
        if (
          !this.animation &&
          (screen.x < 0.27 ||
            screen.x > 0.62 ||
            screen.y < 0.23 ||
            screen.y > 0.47)
        )
          this.transition(crop(b, this.value.scale), now, 700);
      }
      return true;
    }
    if (now < this.cooldown) return false;
    if (!usable(f)) {
      this.candidates = [];
      this.state = "wide";
      return true;
    }
    const prior = this.candidates.at(-1),
      first = this.candidates[0];
    if (
      (prior && (prior.id !== f.id || now - prior.time > 300)) ||
      (first &&
        (Math.hypot(
          c.x - centre(first.bounds).x,
          c.y - centre(first.bounds).y,
        ) > 0.045 ||
          Math.abs(b.height / first.bounds.height - 1) > 0.16))
    )
      this.candidates = [];
    this.candidates.push(f);
    while (this.candidates.length > 32) this.candidates.shift();
    this.state = "acquiring";
    if (this.candidates.length >= 5 && now - this.candidates[0].time >= 650) {
      const median = (key: keyof FrameBounds) => {
        const a = this.candidates
          .map((p) => p.bounds[key])
          .sort((a, b) => a - b);
        return a[Math.floor(a.length / 2)];
      };
      const bounds = {
        x: median("x"),
        y: median("y"),
        width: median("width"),
        height: median("height"),
      };
      const scale = clamp(
        Math.min(0.34 / bounds.height, 0.44 / bounds.width),
        1,
        3,
      );
      this.owner = f.id;
      this.latest = f;
      this.lastSeen = now;
      this.state = "focused";
      this.candidates = [];
      this.transition(crop(bounds, scale), now, 900);
    }
    return true;
  }
  update(now: number): Crop {
    if (
      this.owner !== null &&
      this.state !== "returning" &&
      now - this.lastSeen > 1200
    ) {
      this.state = "returning";
      this.transition(wide(), now, 700);
      this.latest = null;
      this.candidates = [];
    }
    if (
      this.state === "acquiring" &&
      this.candidates.length &&
      now - this.candidates.at(-1)!.time > 400
    ) {
      this.state = "wide";
      this.candidates = [];
    }
    if (this.animation) {
      const a = this.animation,
        t = clamp((now - a.at) / a.duration, 0, 1),
        ease = t * t * t * (10 + t * (-15 + 6 * t));
      this.value = {
        scale: a.from.scale + (a.to.scale - a.from.scale) * ease,
        x: a.from.x + (a.to.x - a.from.x) * ease,
        y: a.from.y + (a.to.y - a.from.y) * ease,
      };
      if (t === 1) {
        this.value = { ...a.to };
        this.animation = null;
        if (this.state === "returning") {
          this.owner = null;
          this.state = "wide";
          this.cooldown = now + 300;
          this.largeSince = null;
        }
      }
    }
    return { ...this.value };
  }
  /** Only hands near the active visitor can navigate while framing is enabled. */
  allowsHand(x: number, y: number, now: number) {
    if (
      this.state !== "focused" ||
      this.owner === null ||
      !this.latest ||
      now - this.lastSeen > 650
    )
      return false;
    const b = this.latest.source,
      c = centre(b);
    return (
      x >= c.x - b.width * 3 &&
      x <= c.x + b.width * 3 &&
      y >= b.y - b.height * 0.5 &&
      y <= b.y + b.height * 6
    );
  }
  matchesBody(
    left: { x: number; y: number },
    right: { x: number; y: number },
    now: number,
  ) {
    if (this.state !== "focused" || !this.latest || now - this.lastSeen > 650)
      return false;
    const b = this.latest.source,
      c = centre(b),
      span = Math.abs(left.x - right.x),
      cy = (left.y + right.y) / 2;
    return (
      Math.abs(c.x - (left.x + right.x) / 2) <= Math.max(0.06, span * 0.4) &&
      c.y < cy &&
      cy - c.y < b.height * 3.5
    );
  }
  reset() {
    this.owner = null;
    this.state = "wide";
    this.candidates = [];
    this.latest = null;
    this.value = wide();
    this.animation = null;
    this.lastSeen = -Infinity;
    this.cooldown = -Infinity;
    this.largeSince = null;
  }
}
