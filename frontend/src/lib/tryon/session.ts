import type { Product } from "../api";
import { decodeObservation, type Finger } from "./protocol";
import { HandSolver } from "./tracking";
import { RingRenderer } from "./renderer";
import { isLivePose } from "./timing";
export type SessionState = {
  phase: "loading" | "searching" | "tracking" | "error";
  message: string;
  latency?: number;
  inferenceMs?: number;
  confidence?: number;
  cameraSource?: string;
};
export class RingSession {
  private disposed = false;
  private stream: MediaStream | null = null;
  private renderer: RingRenderer | null = null;
  private abort = new AbortController();
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private solver = new HandSolver();
  private frame = document.createElement("canvas");
  private finger: Finger = "ring";
  private fit = 1;
  private lastGood = 0;
  private poseCapture = -Infinity;
  private poseVisible = false;
  private facing: "user" | "environment" = "environment";
  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private endpoint: string,
    private notify: (s: SessionState) => void,
  ) {}
  configure(finger: Finger, fit: number) {
    if (this.finger !== finger) {
      this.solver.reset();
      this.clearPose();
    }
    this.finger = finger;
    this.fit = fit;
  }
  private clearPose() {
    this.poseVisible = false;
    this.renderer?.hide();
    this.renderer?.render();
  }
  async start(product: Product, facing: "user" | "environment") {
    this.facing = facing;
    if (!this.endpoint)
      throw Error("Virtual fitting service is not configured.");
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Camera requires HTTPS and a supported browser.");
    this.notify({ phase: "loading", message: "Preparing your fitting room…" });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 960 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    if (this.disposed) return;
    this.renderer = new RingRenderer(this.canvas);
    await this.renderer.load(product);
    if (this.disposed) return;
    const loop = () => {
      if (this.disposed) return;
      // The native <video> runs independently of inference and WebGL. Clear
      // expired overlays even if the next fetch never resolves.
      if (
        this.poseVisible &&
        !isLivePose(this.poseCapture, performance.now())
      ) {
        this.clearPose();
        this.notify({
          phase: "searching",
          message: "Camera is live. Waiting for a fresh hand position…",
        });
      }
      // Projection also follows viewport changes; render is inexpensive while
      // hidden (no hand/jewelry draw calls and no video texture uploads).
      this.renderer?.render();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    this.notify({
      phase: "searching",
      message: "Place one hand in view, with your fingers gently apart.",
    });
    void this.capture();
  }
  private async capture() {
    if (this.disposed) return;
    const video = this.video;
    if (!video.videoWidth) {
      this.timer = setTimeout(() => void this.capture(), 100);
      return;
    }
    const width = 480,
      height = Math.round((width * video.videoHeight) / video.videoWidth);
    if (this.frame.width !== width) this.frame.width = width;
    if (this.frame.height !== height) this.frame.height = height;
    this.frame
      .getContext("2d")!
      .drawImage(video, 0, 0, this.frame.width, this.frame.height);
    const captured = performance.now(),
      finger = this.finger;
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    this.abort.signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 8000);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        this.frame.toBlob(resolve, "image/jpeg", 0.78),
      );
      if (!blob || this.disposed) return;
      const body = new FormData();
      body.append("frame", blob, "frame.jpg");
      body.append("include_mesh", "true");
      const response = await fetch(
        this.endpoint.replace(/\/$/, "") + "/v1/hand-pose",
        {
          method: "POST",
          body,
          signal: timeout.signal,
          cache: "no-store",
          credentials: "omit",
        },
      );
      if (!response.ok)
        throw Error(
          response.status === 429
            ? "Fitting service is busy. Retrying…"
            : `Fitting service returned ${response.status}`,
        );
      const observation = decodeObservation(
        await response.json(),
        captured,
        performance.now(),
      );
      if (this.disposed) return;
      // A response for the previous finger must never attach to the new selection.
      const solved =
        finger === this.finger && isLivePose(captured, performance.now())
          ? this.solver.solve(observation, finger, this.anchor)
          : null;
      // Only geometry is updated here. This request never controls the camera.
      this.renderer?.present(solved, this.fit);
      this.poseVisible = !!solved;
      this.poseCapture = solved ? captured : -Infinity;
      this.renderer?.render();
      if (solved) {
        this.lastGood = performance.now();
        this.notify({
          phase: "tracking",
          message: "Your ring, in perspective.",
          latency: observation.receivedAt - captured,
          inferenceMs: observation.inferenceMs,
          confidence: solved.hand.confidence,
          cameraSource: solved.hand.camera.source || "estimated",
        });
      } else {
        if (performance.now() - this.lastGood > 1500) this.solver.reset();
        this.notify({
          phase: "searching",
          message: !isLivePose(captured, observation.receivedAt)
            ? "Camera is live. Hand processing is taking too long; keep your hand still."
            : "Show your whole hand in soft, even light.",
        });
      }
    } catch (e) {
      if (!this.disposed) {
        this.clearPose();
        this.notify({
          phase: "error",
          message:
            e instanceof Error
              ? e.message
              : "Unable to reach the fitting service. Camera is still live.",
        });
      }
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener("abort", cancel);
      if (!this.disposed)
        this.timer = setTimeout(() => void this.capture(), 100);
    }
  }
  anchor = 0.22;
  snapshot() {
    this.renderer?.render();
    return this.renderer?.snapshot(this.video, this.facing === "user");
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.pause();
    this.video.srcObject = null;
    this.renderer?.dispose();
  }
}
