import type { HandPoint } from "./hand-swipe";
import { HandSwipeDetector } from "./hand-swipe";
import type { SwipeDirection } from "./swipe";
export class HandSwipeTracker {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private ready = false;
  private busy = false;
  private previous = -1;
  private sceneUntil = -Infinity;
  private detector = new HandSwipeDetector();
  private video: HTMLVideoElement | null = null;
  private frameCallback: number | null = null;
  private aspect = 1;
  constructor(
    private swipe: (direction: SwipeDirection) => void,
    private failed: () => void,
    private mirrored: boolean,
    private eligible?: (points:HandPoint[])=>boolean,
  ) {}
  start(video: HTMLVideoElement) {
    if (this.worker || this.disposed) return;
    this.video = video;
    try {
      this.worker = new Worker("/workers/hand-swipe.js");
      this.worker.onerror = () => this.fail();
      this.worker.onmessage = ({ data }) => {
        if (this.disposed) return;
        if (this.deadline) clearTimeout(this.deadline);
        if (data.type === "ready") {
          this.ready = true;
          void this.capture(video);
        } else if (data.type === "hands") {
          this.busy = false;
          if (data.sceneChanged) {
            this.detector = new HandSwipeDetector();
            this.sceneUntil = data.time + 180;
          }
          if (performance.now() - data.time > 350) {
            this.detector = new HandSwipeDetector();
          } else if (data.time >= this.sceneUntil) {
            const entries=(data.landmarks as HandPoint[][]).map((points,index)=>({points,label:data.handedness?.[index]})).filter(entry=>!this.eligible||this.eligible(entry.points));
            const direction = this.detector.update(
              entries.map(e=>e.points),
              data.time,
              this.mirrored,
              this.aspect,
              entries.map(e=>e.label),
            );
            if (direction) this.swipe(direction);
          }
          if (!this.disposed) void this.capture(video);
        } else if (data.type === "error") this.fail();
      };
      this.worker.postMessage({ type: "init" });
      this.deadline = setTimeout(() => this.fail(), 30000);
      if (video.requestVideoFrameCallback) {
        const frame = () => {
          if (this.disposed) return;
          void this.capture(video);
          this.frameCallback = video.requestVideoFrameCallback(frame);
        };
        this.frameCallback = video.requestVideoFrameCallback(frame);
      } else this.timer = setInterval(() => void this.capture(video), 33);
    } catch {
      this.fail();
    }
  }
  private async capture(video: HTMLVideoElement) {
    if (
      this.disposed ||
      !this.ready ||
      this.busy ||
      video.readyState < 2 ||
      !video.videoWidth ||
      this.previous === video.currentTime
    )
      return;
    this.busy = true;
    this.previous = video.currentTime;
    const aspect = video.videoWidth / video.videoHeight;
    if (Math.abs(aspect - this.aspect) > 0.01)
      this.detector = new HandSwipeDetector();
    this.aspect = aspect;
    const time = performance.now(),
      scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    let frame: ImageBitmap | undefined;
    try {
      frame = await createImageBitmap(video, {
        resizeWidth: Math.round(video.videoWidth * scale),
        resizeHeight: Math.round(video.videoHeight * scale),
        resizeQuality: "high",
      });
      if (this.disposed) {
        frame.close();
        return;
      }
      this.deadline = setTimeout(() => this.fail(), 10000);
      this.worker!.postMessage({ type: "frame", frame, time }, [frame]);
    } catch {
      frame?.close();
      if (!this.disposed) this.fail();
    }
  }
  private fail() {
    if (this.disposed) return;
    this.dispose();
    this.failed();
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.deadline) clearTimeout(this.deadline);
    this.worker?.terminate();
    this.worker = null;
    if (this.frameCallback !== null)
      this.video?.cancelVideoFrameCallback?.(this.frameCallback);
    this.video = null;
  }
}
