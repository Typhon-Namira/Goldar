import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BodyPoseTracker } from "./body-pose";
class WorkerStub {
  static current: WorkerStub;
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { WorkerStub.current = this; }
  send(data: Record<string, unknown>) { this.onmessage?.({ data }); }
}
const video = () => ({ readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1 }) as HTMLVideoElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("shared-camera body inference lifecycle", () => {
  it("timestamps the captured image, so slow inference cannot masquerade as a current pose", async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const result = vi.fn(), failed = vi.fn();
    const tracker = new BodyPoseTracker(result, failed);
    tracker.start(video());
    const worker = WorkerStub.current;
    worker.send({ type: "ready" });
    await vi.advanceTimersByTimeAsync(110);
    const frame = worker.postMessage.mock.calls[1][0];
    await vi.advanceTimersByTimeAsync(900);
    expect(worker.postMessage).toHaveBeenCalledTimes(2); // init and one in-flight image
    worker.send({ type: "pose", points: [], neck: null, time: frame.time });
    expect(performance.now() - result.mock.calls[0][0].time).toBe(900);
    expect(failed).not.toHaveBeenCalled();
    tracker.dispose();
    await vi.advanceTimersByTimeAsync(30000);
    expect(failed).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("closes a bitmap resolved after Stop without dispatching another camera frame", async () => {
    let resolve!: (value: unknown) => void;
    const bitmap = { close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((done) => { resolve = done; })));
    const result = vi.fn(), failed = vi.fn();
    const tracker = new BodyPoseTracker(result, failed);
    tracker.start(video()); WorkerStub.current.send({ type: "ready" });
    await vi.advanceTimersByTimeAsync(110);
    tracker.dispose();
    resolve(bitmap); await vi.advanceTimersByTimeAsync(0);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
  });
  it("releases the bitmap and stops the worker when frame transfer fails", async () => {
    const bitmap = { close: vi.fn() }, failed = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const tracker = new BodyPoseTracker(vi.fn(), failed);
    tracker.start(video()); WorkerStub.current.send({ type: "ready" });
    WorkerStub.current.postMessage.mockImplementation(() => { throw Error("transfer failed"); });
    await vi.advanceTimersByTimeAsync(110);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(WorkerStub.current.terminate).toHaveBeenCalledTimes(1);
  });
});

it('discards an in-flight observation belonging to the previous visitor after profile reset',async()=>{
 vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close:vi.fn()}));
 const result=vi.fn(),tracker=new BodyPoseTracker(result,vi.fn()),v=video();
 tracker.start(v);const worker=WorkerStub.current;worker.send({type:'ready'});
 await vi.advanceTimersByTimeAsync(110);
 tracker.resetProfile();worker.send({type:'pose',points:[],neck:null,time:110});
 expect(result).not.toHaveBeenCalled();
 v.currentTime++;await vi.advanceTimersByTimeAsync(110);
 worker.send({type:'pose',points:[],neck:null,time:220});
 expect(result).toHaveBeenCalledTimes(1);tracker.dispose();
});

it('keeps the chin reference from image capture rather than sampling it after delayed bitmap decoding',async()=>{
 let resolve!: (bitmap: unknown)=>void;
 vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise(done=>{resolve=done;})));
 let chin={chinX:.48,chinY:.4};const result=vi.fn();
 const tracker=new BodyPoseTracker(result,vi.fn(),()=>chin);tracker.start(video());
 const worker=WorkerStub.current;worker.send({type:'ready'});
 await vi.advanceTimersByTimeAsync(110);
 chin={chinX:.6,chinY:.5};resolve({close:vi.fn()});await vi.advanceTimersByTimeAsync(0);
 const frame=worker.postMessage.mock.calls[1][0];expect(frame.region).toEqual({chinX:.48,chinY:.4});
 worker.send({type:'pose',points:[],neck:null,time:110});
 expect(result.mock.calls[0][0].reference).toEqual(frame.region);tracker.dispose();
});
