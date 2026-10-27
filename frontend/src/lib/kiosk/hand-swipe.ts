import type { SwipeDirection } from "./swipe";
export type HandPoint = { x: number; y: number; z?: number };
type Sample = {
  x: number;
  y: number;
  time: number;
  span: number;
  shape: number[];
  label?: string;
};
/** Rotation-aligned palm error: turning the wrist during a swipe is normal. */
function shapeError(a: Sample, b: Sample) {
  let dot = 0,
    cross = 0;
  for (let i = 0; i < a.shape.length; i += 2) {
    dot += a.shape[i] * b.shape[i] + a.shape[i + 1] * b.shape[i + 1];
    cross += a.shape[i] * b.shape[i + 1] - a.shape[i + 1] * b.shape[i];
  }
  const angle = Math.atan2(cross, dot),
    c = Math.cos(angle),
    s = Math.sin(angle);
  if (Math.abs(angle) > Math.PI * 0.45) return Infinity;
  let error = 0;
  for (let i = 0; i < a.shape.length; i += 2) {
    error += (a.shape[i] * c - a.shape[i + 1] * s - b.shape[i]) ** 2;
    error += (a.shape[i] * s + a.shape[i + 1] * c - b.shape[i + 1]) ** 2;
  }
  return Math.sqrt(error / a.shape.length);
}
function coherent(a: Sample, b: Sample) {
  const ratio = b.span / a.span;
  return ratio > 0.55 && ratio < 1.8 && shapeError(a, b) < 0.55;
}
class PalmTrack {
  samples: Sample[] = [];
  latest: Sample;
  private armed = true;
  private direction = 0;
  private idleSince: number | null = null;
  constructor(sample: Sample) {
    this.latest = sample;
    this.samples = [sample];
  }
  reseed(sample: Sample) {
    this.latest = sample;
    this.samples = [sample];
    this.idleSince = null;
  }
  update(sample: Sample): SwipeDirection | null {
    const prior = this.latest;
    this.latest = sample;
    const dy = sample.y - prior.y,
      dt = sample.time - prior.time;
    if (Math.abs(dy) < Math.max(0.003, sample.span * 0.04)) {
      this.idleSince ??= prior.time;
      if (sample.time - this.idleSince >= 80 && !this.armed) {
        this.armed = true;
        this.samples = [];
      }
    } else this.idleSince = null;
    this.samples.push(sample);
    while (this.samples.length && sample.time - this.samples[0].time > 500)
      this.samples.shift();
    const accept = (travel: number) => {
      const direction = (travel > 0 ? 1 : -1) as SwipeDirection;
      if (!this.armed && direction === this.direction) return null;
      this.direction = direction;
      this.armed = false;
      this.idleSince = null;
      this.samples = [sample];
      return direction;
    };
    const horizontal = Math.abs(sample.x - prior.x),
      speed = Math.abs(dy) / (dt / 1000);
    if (
      dt >= 16 &&
      dt <= 360 &&
      Math.abs(dy) >= Math.max(0.045, sample.span * 0.48) &&
      speed >= 0.28 &&
      speed <= 14 &&
      horizontal <= Math.max(0.028, Math.abs(dy) * 0.7) &&
      coherent(prior, sample)
    )
      return accept(dy);
    if (this.samples.length < 3) return null;
    const first = this.samples[0],
      travel = sample.y - first.y;
    const sideways =
      Math.max(...this.samples.map((p) => p.x)) -
      Math.min(...this.samples.map((p) => p.x));
    const steps = this.samples
      .slice(1)
      .map((p, i) => Math.abs(p.y - this.samples[i].y));
    if (
      sample.time - first.time >= 65 &&
      Math.abs(travel) >= Math.max(0.05, sample.span * 0.45) &&
      sideways <= Math.max(0.028, Math.abs(travel) * 0.7) &&
      steps.filter((d) => d > 0.004).length >= 2 &&
      Math.abs(travel) /
        Math.max(
          0.001,
          steps.reduce((s, d) => s + d, 0),
        ) >=
        0.78 &&
      coherent(first, sample)
    )
      return accept(travel);
    return null;
  }
}
/** Vertical, screen-relative navigation: down = next/lower, up = previous/upper.
 * Tracks both palms independently, associates identities before measuring
 * motion, and consumes a sweep once. Mirror mode cannot reverse vertical input.
 * Coordinates use image-height units so aspect ratio cannot change direction. */
export class HandSwipeDetector {
  private tracks: PalmTrack[] = [];
  private previous = -Infinity;
  private cooldown = -Infinity;
  update(
    hands: HandPoint[][],
    time: number,
    _mirrored = false,
    aspect = 1,
    labels: string[] = [],
  ): SwipeDirection | null {
    if (
      !Number.isFinite(time) ||
      time <= this.previous ||
      !Number.isFinite(aspect) ||
      aspect <= 0
    )
      return null;
    this.previous = time;
    this.tracks = this.tracks.filter((t) => time - t.latest.time <= 360);
    const candidates: Sample[] = [];
    for (let h = 0; h < Math.min(2, hands.length); h++) {
      const hand = hands[h];
      if (
        hand.length < 21 ||
        ![0, 5, 9, 13, 17].every(
          (i) => Number.isFinite(hand[i]?.x) && Number.isFinite(hand[i]?.y),
        )
      )
        continue;
      const palm = [0, 5, 9, 13, 17].map((i) => hand[i]);
      const x = palm.reduce((s, p) => s + p.x * aspect, 0) / 5,
        y = palm.reduce((s, p) => s + p.y, 0) / 5;
      const span = Math.hypot(
        (hand[5].x - hand[17].x) * aspect,
        hand[5].y - hand[17].y,
      );
      if (span < 0.012 || span > 0.8 || x < 0 || x > aspect || y < 0 || y > 1)
        continue;
      // One physical palm can occasionally produce overlapping detections.
      // It must not acquire two independent gesture latches.
      if (
        candidates.some(
          (p) => Math.hypot(p.x - x, p.y - y) < Math.max(p.span, span) * 0.7,
        )
      )
        continue;
      candidates.push({
        x,
        y,
        span,
        time,
        label: labels[h],
        shape: palm.flatMap((p) => [
          (p.x * aspect - x) / span,
          (p.y - y) / span,
        ]),
      });
    }
    // Global nearest-palm assignment; array order is not a hand identity.
    const pairs: { track: PalmTrack; sample: Sample; cost: number }[] = [];
    for (const track of this.tracks)
      for (const sample of candidates) {
        const prior = track.latest;
        if (prior.label && sample.label && prior.label !== sample.label)
          continue;
        if (
          !coherent(prior, sample) ||
          Math.abs(sample.x - prior.x) > Math.max(0.12, prior.span * 2)
        )
          continue;
        const distance = Math.hypot(sample.x - prior.x, sample.y - prior.y);
        if (distance > Math.min(1, (14 * (time - prior.time)) / 1000)) continue;
        pairs.push({
          track,
          sample,
          cost: distance + shapeError(prior, sample) * 0.1,
        });
      }
    pairs.sort((a, b) => a.cost - b.cost);
    const usedTracks = new Set<PalmTrack>(),
      usedSamples = new Set<Sample>();
    let output: SwipeDirection | null = null;
    for (const { track, sample } of pairs) {
      if (usedTracks.has(track) || usedSamples.has(sample)) continue;
      usedTracks.add(track);
      usedSamples.add(sample);
      const direction = track.update(sample);
      // All tracks consume their gesture even during refractory time. Two
      // hands moving together must not become a delayed second selection.
      if (direction && time >= this.cooldown && !output) output = direction;
    }
    for (const sample of candidates) {
      if (usedSamples.has(sample)) continue;
      // Reacquisition can change pose or handedness slightly. Reseed the
      // nearby palm without granting a consumed sweep a fresh armed state.
      const nearby = this.tracks
        .filter(
          (t) =>
            !usedTracks.has(t) &&
            Math.hypot(t.latest.x - sample.x, t.latest.y - sample.y) <
              Math.max(0.025, sample.span * 0.65),
        )
        .sort((a, b) => b.latest.time - a.latest.time)[0];
      if (nearby) {
        nearby.reseed(sample);
        usedTracks.add(nearby);
      } else this.tracks.push(new PalmTrack(sample));
    }
    // At most two active palms plus short occlusion history, never a backlog.
    this.tracks = this.tracks
      .sort((a, b) => b.latest.time - a.latest.time)
      .slice(0, 4);
    if (output) this.cooldown = time + 180;
    return output;
  }
}
