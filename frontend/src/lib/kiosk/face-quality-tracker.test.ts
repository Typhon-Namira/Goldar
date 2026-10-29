import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { FaceQualityTracker } from "./face-quality";
class WorkerStub {
  static current: WorkerStub;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.current = this;
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
beforeEach(() => {
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const video = {
  readyState: 4,
  videoWidth: 1280,
  videoHeight: 720,
} as HTMLVideoElement;
const bounds = { x: 0.3, y: 0.2, width: 0.2, height: 0.3 };
it("captures a bounded raw face crop, never queues several images, and rejects stale/other-person quality", async () => {
  const image = { close: vi.fn() },
    bitmap = vi.fn().mockResolvedValue(image);
  vi.stubGlobal("createImageBitmap", bitmap);
  const tracker = new FaceQualityTracker();
  tracker.start(video);
  tracker.sample(1, bounds, 200);
  tracker.sample(1, bounds, 400);
  await Promise.resolve();
  expect(bitmap).toHaveBeenCalledTimes(1);
  expect(bitmap.mock.calls[0].slice(1, 5)).toEqual([384, 144, 256, 216]);
  WorkerStub.current.send({ type: "quality", id: 1, time: 200, usable: true });
  expect(tracker.usable(1, 400)).toBe(true);
  expect(tracker.usable(2, 400)).toBe(false);
  expect(tracker.usable(1, 1200)).toBe(false);
  tracker.dispose();
  expect(WorkerStub.current.terminate).toHaveBeenCalledTimes(1);
});
it("closes a late crop when the camera session ends before decoding", async () => {
  let resolve!: (value: unknown) => void;
  const image = { close: vi.fn() };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  const tracker = new FaceQualityTracker();
  tracker.start(video);
  tracker.sample(1, bounds, 200);
  tracker.dispose();
  resolve(image);
  await Promise.resolve();
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(WorkerStub.current.postMessage).not.toHaveBeenCalled();
});
it("does not manufacture quality from a tiny or clipped source face", () => {
  const bitmap = vi.fn();
  vi.stubGlobal("createImageBitmap", bitmap);
  const tracker = new FaceQualityTracker();
  tracker.start(video);
  tracker.sample(1, { ...bounds, width: 0.02 }, 200);
  tracker.sample(1, { ...bounds, x: -0.1 }, 400);
  expect(bitmap).not.toHaveBeenCalled();
  expect(tracker.usable(1, 500)).toBe(false);
  tracker.dispose();
});

it("reports unsupported quality workers once so the mirror can keep normal fitting", () => {
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        throw Error("unsupported");
      }
    },
  );
  const failed = vi.fn(),
    tracker = new FaceQualityTracker(failed);
  tracker.start(video);
  tracker.start(video);
  expect(failed).toHaveBeenCalledTimes(1);
  expect(tracker.usable(1, 500)).toBe(false);
});

it("does not let a failed transfer timer disable a recovered quality stream", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ close: vi.fn() }),
  );
  const failed = vi.fn(),
    tracker = new FaceQualityTracker(failed);
  tracker.start(video);
  WorkerStub.current.postMessage.mockImplementationOnce(() => {
    throw Error("transfer");
  });
  tracker.sample(1, bounds, 200);
  await Promise.resolve();
  tracker.sample(1, bounds, 750);
  await Promise.resolve();
  expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(2);
  WorkerStub.current.send({ type: "quality", id: 1, time: 750, usable: true });
  await vi.advanceTimersByTimeAsync(4100);
  expect(failed).not.toHaveBeenCalled();
  expect(tracker.usable(1, 900)).toBe(true);
  tracker.dispose();
});
