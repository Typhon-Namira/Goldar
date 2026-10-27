import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { HandSwipeTracker } from "./hand-tracker";
class WorkerStub {
  static current: WorkerStub;
  onmessage: ((e: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(public url: string) {
    WorkerStub.current = this;
  }
  send(data: Record<string, unknown>) {
    this.onmessage?.({ data });
  }
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const video = () =>
  ({
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 1,
  }) as HTMLVideoElement;
it("turns independent hand-worker results into a swipe on the existing video without body landmarks", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ close: vi.fn() }),
  );
  const swipe = vi.fn(),
    failed = vi.fn(),
    v = video(),
    tracker = new HandSwipeTracker(swipe, failed, false);
  tracker.start(v);
  const worker = WorkerStub.current;
  expect(worker.url).toBe("/workers/hand-swipe.js");
  worker.send({ type: "ready" });
  for (let i = 0; i < 3; i++) {
    await vi.advanceTimersByTimeAsync(90);
    const frame = worker.postMessage.mock.calls.at(-1)![0];
    worker.send({
      type: "hands",
      time: frame.time,
      landmarks: [
        Array.from({ length: 21 }, (_, j) => ({
          x: 0.3 + (j % 5) * 0.015,
          y: 0.3 + i * 0.05 + Math.floor(j / 5) * 0.02,
        })),
      ],
    });
    v.currentTime++;
  }
  expect(swipe).toHaveBeenCalledTimes(1);
  expect(swipe).toHaveBeenCalledWith(1);
  expect(failed).not.toHaveBeenCalled();
  tracker.dispose();
  await vi.advanceTimersByTimeAsync(30000);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
});
it("releases a late bitmap when the mirror closes during capture", async () => {
  let finish!: (v: unknown) => void;
  const bitmap = { close: vi.fn() },
    failed = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const tracker = new HandSwipeTracker(vi.fn(), failed, true);
  tracker.start(video());
  WorkerStub.current.send({ type: "ready" });
  await vi.advanceTimersByTimeAsync(90);
  tracker.dispose();
  finish(bitmap);
  await vi.advanceTimersByTimeAsync(0);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
});
it("reports initialization failure only once and ignores late results after disposal", () => {
  const failed = vi.fn(),
    swipe = vi.fn(),
    tracker = new HandSwipeTracker(swipe, failed, true);
  tracker.start(video());
  WorkerStub.current.send({ type: "error" });
  WorkerStub.current.onerror?.();
  WorkerStub.current.send({ type: "hands", landmarks: [], time: 0 });
  expect(failed).toHaveBeenCalledTimes(1);
  expect(swipe).not.toHaveBeenCalled();
});

it("uses video-frame callbacks and cancels them when the mirror closes", async () => {
  const callbacks: FrameRequestCallback[] = [];
  const cancel = vi.fn(),
    v = video();
  v.requestVideoFrameCallback = vi.fn((callback) => {
    callbacks.push(callback as unknown as FrameRequestCallback);
    return callbacks.length;
  });
  v.cancelVideoFrameCallback = cancel;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ close: vi.fn() }),
  );
  const tracker = new HandSwipeTracker(vi.fn(), vi.fn(), true);
  tracker.start(v);
  WorkerStub.current.send({ type: "ready" });
  await vi.advanceTimersByTimeAsync(0);
  expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(2);
  callbacks[0](33);
  await vi.advanceTimersByTimeAsync(0);
  expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(2); // never two in flight
  tracker.dispose();
  expect(cancel).toHaveBeenCalledWith(2);
});

it("does not navigate using a result delayed by a backgrounded or overloaded browser", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ close: vi.fn() }),
  );
  const swipe = vi.fn(),
    v = video(),
    tracker = new HandSwipeTracker(swipe, vi.fn(), true);
  tracker.start(v);
  const worker = WorkerStub.current;
  worker.send({ type: "ready" });
  await vi.advanceTimersByTimeAsync(0);
  const landmarks = (y: number) => [
    Array.from({ length: 21 }, (_, j) => ({
      x: 0.5 + (j % 5) * 0.015,
      y: y + Math.floor(j / 5) * 0.02,
    })),
  ];
  worker.send({ type: "hands", landmarks: landmarks(0.2), time: 0 });
  v.currentTime++;
  await vi.advanceTimersByTimeAsync(33);
  await vi.advanceTimersByTimeAsync(400);
  worker.send({ type: "hands", landmarks: landmarks(0.4), time: 33 });
  expect(swipe).not.toHaveBeenCalled();
  tracker.dispose();
});
