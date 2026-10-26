import { NeckProfileMemory } from "./neck-profile";
export type BodyPoint = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};
export type BodyPose = {
  points: BodyPoint[];
  neck?: { left: number; right: number; y: number } | null;
  time: number;
  width: number;
  height: number;
};

/** One in-flight inference, shared XR8 video, CPU worker. No second camera. */
export class BodyPoseTracker {
  private worker: Worker | null = null;
  private profile = new NeckProfileMemory();
  private ready = false;
  private busy = false;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private video: HTMLVideoElement | null = null;
  private previousVideoTime = -1;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private dimensions = { width: 0, height: 0 };
  constructor(
    private result: (pose: BodyPose) => void,
    private failed: (message: string) => void,
    private reference?: (
      width: number,
      height: number,
    ) => { chinY: number } | null,
  ) {}
  start(video: HTMLVideoElement) {
    this.video = video;
    if (this.worker || this.disposed) return;
    try {
      this.worker = new Worker("/workers/neck-pose.js");
    } catch {
      this.fail("Body tracking workers are unavailable on this device.");
      return;
    }
    this.worker.onerror = () =>
      this.fail("Body tracking could not start. Reload and retry.");
    this.worker.onmessage = ({ data }) => {
      if (this.disposed) return;
      if (data.type === "ready") {
        if (this.deadline) clearTimeout(this.deadline);
        this.ready = true;
      } else if (data.type === "pose") {
        if (this.deadline) clearTimeout(this.deadline);
        this.busy = false;
        this.result(
          this.profile.apply({
            points: data.points,
            neck: data.neck,
            time: data.time,
            ...this.dimensions,
          }),
        );
      } else if (data.type === "error")
        this.fail(
          "Body tracking is unavailable on this device. Reload to retry.",
        );
    };
    this.worker.postMessage({ type: "init" });
    this.deadline = setTimeout(
      () => this.fail("Body tracking loading timed out. Reload to retry."),
      25000,
    );
    this.timer = setInterval(() => void this.capture(), 110);
  }
  private fail(message: string) {
    this.dispose();
    this.failed(message);
  }
  private async capture() {
    const video = this.video;
    if (
      this.disposed ||
      !this.ready ||
      this.busy ||
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      video.currentTime === this.previousVideoTime
    )
      return;
    this.busy = true;
    this.previousVideoTime = video.currentTime;
    this.dimensions = { width: video.videoWidth, height: video.videoHeight };
    const capturedAt = performance.now();
    let frame: ImageBitmap | undefined;
    try {
      const scale = Math.min(
        1,
        384 / Math.max(video.videoWidth, video.videoHeight),
      );
      frame = await createImageBitmap(video, {
        resizeWidth: Math.round(video.videoWidth * scale),
        resizeHeight: Math.round(video.videoHeight * scale),
        resizeQuality: "low",
      });
      if (this.disposed) {
        frame.close();
        return;
      }
      this.deadline = setTimeout(
        () => this.fail("Body tracking stopped responding. Reload to retry."),
        10000,
      );
      this.worker!.postMessage(
        {
          type: "frame",
          frame,
          time: capturedAt,
          region: this.reference?.(video.videoWidth, video.videoHeight) ?? null,
        },
        [frame],
      );
    } catch {
      frame?.close();
      if (!this.disposed)
        this.fail("Unable to read camera frames for body tracking.");
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.deadline) clearTimeout(this.deadline);
    this.worker?.terminate();
    this.worker = null;
    this.video = null;
  }
}
