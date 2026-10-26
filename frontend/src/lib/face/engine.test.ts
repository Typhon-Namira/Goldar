import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture } from "three";
import type { Product } from "../api";
import type { BodyPose } from "./body-pose";
import type { PipelineModule, FaceData } from "./types";
import { FaceEngine } from "./engine";
const hooks = vi.hoisted(() => ({ pose: null as null | ((pose: BodyPose) => void), bodyDisposed: vi.fn() }));
vi.mock("./body-pose", () => ({ BodyPoseTracker: class {
  constructor(result: (pose: BodyPose) => void) { hooks.pose = result; }
  start() {}
  dispose = hooks.bodyDisposed;
} }));
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({ GLTFLoader: class {
  setDRACOLoader() { return this; }
  setMeshoptDecoder() { return this; }
  async loadAsync() {
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    return { scene };
  }
} }));
let engine: FaceEngine | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  hooks.bodyDisposed.mockClear(); hooks.pose = null;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { engine?.dispose(); engine = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start(category: string) {
  const scene = new Scene(), previousEnvironment = new Texture();
  scene.environment = previousEnvironment;
  const camera = new PerspectiveCamera(60, 4 / 3, 0.01, 100);
  camera.updateMatrixWorld(true);
  let module!: PipelineModule;
  const xr = {
    loadChunk: vi.fn().mockResolvedValue(undefined),
    addCameraPipelineModules: (modules: PipelineModule[]) => { module = modules.at(-1)!; },
    run: vi.fn(() => module.onStart?.()), stop: vi.fn(),
    FaceController: { configure: vi.fn(), pipelineModule: vi.fn() },
    GlTextureRenderer: { pipelineModule: vi.fn() },
    Threejs: { pipelineModule: vi.fn(), xrScene: () => ({ scene, camera, renderer: {} }) },
  };
  vi.stubGlobal("window", { XR8: xr, innerWidth: 640, innerHeight: 480 });
  const canvas = { width: 640, height: 480, parentElement: { clientWidth: 640, clientHeight: 480 }, style: {} } as unknown as HTMLCanvasElement;
  const status = vi.fn();
  engine = new FaceEngine(canvas, { category, glb_url: "/fixture.glb" } as Product, status);
  await engine.start("front");
  return { scene, module, status, xr, previousEnvironment };
}
describe("jewelry engine lifecycle", () => {
  it("hides the necklace and stops inference on a camera exception, including later render updates", async () => {
    const { scene, module } = await start("necklace");
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.6, z: 0, visibility: 1 }));
    points[11].x = 0.7; points[12].x = 0.3;
    hooks.pose!({ points, neck: { left: 0.44, right: 0.56, y: 0.5 }, width: 640, height: 480, time: performance.now() });
    module.onUpdate!();
    const necklace = scene.getObjectByName("GoldarBodyNecklace")!;
    expect(necklace.visible).toBe(true);
    module.onException!(Error("camera disconnected"));
    expect(necklace.visible).toBe(false);
    module.onUpdate!();
    expect(necklace.visible).toBe(false);
    expect(hooks.bodyDisposed).toHaveBeenCalledTimes(1);
  });
  it("clears ear visibility on face loss, reacquires, and remains hidden after a camera exception", async () => {
    const { scene, module } = await start("earring");
    const emit = (name: string, detail: unknown) => module.listeners!.find((l) => l.event === "facecontroller." + name)!.process({ detail });
    const face: FaceData = {
      id: 7, transform: { position: { x: 0, y: 0, z: -1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, scaledWidth: 1 },
      vertices: [], attachmentPoints: { leftLobe: { position: { x: 0.4, y: -0.1, z: 0 } } },
    };
    emit("earpointfound", { id: 7, point: "leftLobe" }); emit("faceupdated", face);
    const left = scene.getObjectByName("GoldarLeftJewelry")!;
    expect(left.visible).toBe(true);
    emit("facelost", { id: 7 });
    await vi.advanceTimersByTimeAsync(200);
    emit("faceupdated", face); // Coordinates alone cannot restore a lost earlobe
    expect(left.visible).toBe(false);
    emit("earpointfound", { id: 7, point: "leftLobe" }); emit("faceupdated", face);
    expect(left.visible).toBe(true);
    module.onException!(Error("camera disconnected"));
    emit("faceupdated", face);
    expect(scene.getObjectByName("GoldarFaceJewelry")!.visible).toBe(false);
  });
  it("reports camera failure even when the SDK only emits a camera-status event", async () => {
    const { module, status } = await start("earring");
    module.onCameraStatusChange!({ status: "failed" });
    expect(status).toHaveBeenLastCalledWith("Camera unavailable. Stop and retry.");
  });
  it("removes preview lights and restores the scene environment on Stop", async () => {
    const { scene, xr, previousEnvironment } = await start("earring");
    expect(scene.environment).not.toBe(previousEnvironment);
    expect(scene.children.length).toBe(3);
    engine!.dispose(); engine!.dispose();
    expect(scene.children).toHaveLength(0);
    expect(scene.environment).toBe(previousEnvironment);
    expect(xr.stop).toHaveBeenCalledTimes(1);
  });
  it("retries loading the engine after a script failure rather than caching a rejected promise", async () => {
    const events = new EventTarget();
    vi.stubGlobal("window", {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    });
    const removed = vi.fn();
    const append = vi.fn((script) => queueMicrotask(() => script.onerror?.()));
    vi.stubGlobal("document", {
      createElement: () => ({ remove: removed, onerror: null }),
      head: { appendChild: append },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      engine = new FaceEngine({} as HTMLCanvasElement, { category: "earring" } as Product, vi.fn());
      await expect(engine.start("front")).rejects.toThrow("Unable to load the face engine");
      engine.dispose();
    }
    expect(append).toHaveBeenCalledTimes(2);
    expect(removed).toHaveBeenCalledTimes(2);
  });

});
