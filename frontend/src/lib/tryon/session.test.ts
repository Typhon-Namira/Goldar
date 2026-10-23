import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const renderer = vi.hoisted(() => ({
  load: vi.fn(),
  render: vi.fn(),
  present: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("./renderer", () => ({ RingRenderer: vi.fn(() => renderer) }));
const decode = vi.hoisted(() => vi.fn());
vi.mock("./protocol", () => ({ decodeObservation: decode }));
const solve = vi.hoisted(() => vi.fn());
vi.mock("./tracking", () => ({
  HandSolver: vi.fn(() => ({ solve, reset: vi.fn() })),
}));
import { RingSession } from "./session";
import { isLivePose, MAX_LIVE_POSE_AGE_MS } from "./timing";
import type { Product } from "../api";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("live camera independence", () => {
  let video: HTMLVideoElement,
    session: RingSession,
    notify: ReturnType<typeof vi.fn>,
    fetcher: ReturnType<typeof vi.fn>,
    stop: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    vi.clearAllMocks();
    renderer.load.mockResolvedValue(undefined);
    stop = vi.fn();
    video = {
      videoWidth: 1280,
      videoHeight: 960,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      srcObject: null,
    } as unknown as HTMLVideoElement;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockResolvedValue({ getTracks: () => [{ stop }] }),
      },
    });
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(["frame"])),
      }),
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    notify = vi.fn();
    session = new RingSession(
      video,
      {} as HTMLCanvasElement,
      "https://inference.example",
      notify,
    );
  });
  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const product = { glb_url: "ring.glb" } as Product;
  it("starts playing before a model or inference request completes", async () => {
    const model = deferred<void>();
    renderer.load.mockReturnValue(model.promise);
    const startup = session.start(product, "environment");
    await vi.advanceTimersByTimeAsync(1);
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.srcObject).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    model.resolve();
    fetcher.mockReturnValue(new Promise(() => {}));
    await startup;
  });
  it("keeps camera attached during a slow response and rejects its stale pose", async () => {
    const request = deferred<Response>();
    fetcher.mockReturnValue(request.promise);
    await session.start(product, "environment");
    await vi.advanceTimersByTimeAsync(3000);
    expect(video.srcObject).not.toBeNull();
    expect(video.pause).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
    decode.mockReturnValue({
      hands: [],
      capturedAt: 0,
      receivedAt: 3000,
      inferenceMs: 2900,
    });
    request.resolve({
      ok: true,
      json: async () => ({ hands: [] }),
    } as Response);
    await vi.advanceTimersByTimeAsync(1);
    expect(solve).not.toHaveBeenCalled();
    expect(renderer.present).toHaveBeenLastCalledWith(null, 1);
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Camera is live"),
      }),
    );
  });
  it("expires geometry from capture time while the next request is pending", async () => {
    fetcher
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockReturnValue(new Promise(() => {}));
    decode.mockImplementation(() => ({
      hands: [],
      capturedAt: performance.now(),
      receivedAt: performance.now(),
      inferenceMs: 0,
    }));
    solve.mockReturnValue({
      capturedAt: 0,
      hand: { confidence: 1, camera: { source: "estimated" } },
    });
    await session.start(product, "environment");
    await vi.advanceTimersByTimeAsync(10);
    expect(renderer.present).toHaveBeenCalledWith(expect.any(Object), 1);
    await vi.advanceTimersByTimeAsync(MAX_LIVE_POSE_AGE_MS + 30);
    expect(renderer.hide).toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });
  it("stopping cancels the pending request and releases the camera", async () => {
    fetcher.mockReturnValue(new Promise(() => {}));
    await session.start(product, "environment");
    await vi.advanceTimersByTimeAsync(1);
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    session.dispose();
    expect(signal.aborted).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});
describe("live pose lifetime", () => {
  it("bounds pose age using capture time", () => {
    expect(isLivePose(100, 449)).toBe(true);
    expect(isLivePose(100, 451)).toBe(false);
    expect(isLivePose(100, 99)).toBe(false);
    expect(isLivePose(NaN, 100)).toBe(false);
  });
});
