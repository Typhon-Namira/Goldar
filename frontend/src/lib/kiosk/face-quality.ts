import type { FrameBounds } from "./auto-frame";
/** Tiny, bounded face crop on the same camera stream; failure keeps wide view. */
export class FaceQualityTracker {
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private busy = false;
  private disposed = false;
  private captured = -Infinity;
  private failures = 0;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  constructor(private failed?: () => void) {}
  private result: { id: number; time: number; usable: boolean } | null = null;
  start(video: HTMLVideoElement) {
    this.video = video;
    if (this.worker || this.disposed) return;
    try {
      this.worker = new Worker("/workers/face-quality.js");
      this.worker.onerror = () => this.fail();
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        if (this.deadline) clearTimeout(this.deadline);
        if (!this.disposed && data.type === "quality")
          this.result = {
            id: data.id,
            time: data.time,
            usable: data.usable === true,
          };
      };
    } catch {
      this.fail();
    }
  }
  usable(id: number, now: number) {
    return (
      !!this.result &&
      this.result.id === id &&
      now - this.result.time < 500 &&
      this.result.usable
    );
  }
  sample(id: number, b: FrameBounds, now: number) {
    const v = this.video;
    if (
      this.disposed ||
      this.busy ||
      !this.worker ||
      !v ||
      v.readyState < 2 ||
      !v.videoWidth ||
      !v.videoHeight ||
      now - this.captured < 160 ||
      b.x < 0 ||
      b.y < 0 ||
      b.x + b.width > 1 ||
      b.y + b.height > 1 ||
      b.width * v.videoWidth < 80 ||
      b.height * v.videoHeight < 96
    )
      return;
    this.busy = true;
    this.captured = now;
    void this.capture(id, b, now, v);
  }
  private async capture(
    id: number,
    b: FrameBounds,
    time: number,
    v: HTMLVideoElement,
  ) {
    let frame: ImageBitmap | undefined;
    try {
      frame = await createImageBitmap(
        v,
        Math.floor(b.x * v.videoWidth),
        Math.floor(b.y * v.videoHeight),
        Math.max(1, Math.floor(b.width * v.videoWidth)),
        Math.max(1, Math.floor(b.height * v.videoHeight)),
        { resizeWidth: 96, resizeHeight: 96, resizeQuality: "high" },
      );
      if (this.disposed) {
        frame.close();
        return;
      }
      this.deadline = setTimeout(() => this.fail(), 4000);
      this.worker!.postMessage({ frame, id, time }, [frame]);
      this.failures = 0;
    } catch {
      frame?.close();
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = null;
      this.busy = false;
      this.result = null;
      if (++this.failures >= 3) this.fail();
    }
  }
  private fail() {
    if (this.disposed) return;
    this.dispose();
    this.failed?.();
  }
  dispose() {
    this.disposed = true;
    if (this.deadline) clearTimeout(this.deadline);
    this.worker?.terminate();
    this.worker = null;
    this.video = null;
    this.result = null;
  }
}
