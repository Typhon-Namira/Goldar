import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture } from "three";
import type { Product } from "../api";
import type { BodyPose } from "./body-pose";
import type { PipelineModule, FaceData } from "./types";
import { FaceEngine } from "./engine";
vi.mock("../kiosk/face-quality",()=>({FaceQualityTracker:class {constructor(failed:()=>void){hooks.qualityFailed=failed;} start(){} sample=hooks.qualitySample; usable(){return hooks.qualityUsable;} dispose(){}}}));
const hooks = vi.hoisted(() => ({ qualitySample:vi.fn(), qualityUsable:true, qualityFailed:null as null|(()=>void), pose: null as null | ((pose: BodyPose) => void), bodyDisposed: vi.fn(), profileReset: vi.fn(), block: null as Promise<void> | null }));
vi.mock("./body-pose", () => ({ BodyPoseTracker: class {
  constructor(result: (pose: BodyPose) => void) { hooks.pose = result; }
  start() {}
  dispose = hooks.bodyDisposed;
  resetProfile = hooks.profileReset;
} }));
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({ GLTFLoader: class {
  setDRACOLoader() { return this; }
  setMeshoptDecoder() { return this; }
  async loadAsync(url: string) {
    if (url === "/broken.glb") throw Error("broken model");
    if (url === "/slow.glb") await hooks.block;
    const scene = new Group();
    scene.name = url;
    scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    return { scene };
  }
} }));
let engine: FaceEngine | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  hooks.profileReset.mockClear();hooks.qualitySample.mockClear();hooks.qualityUsable=true;
  hooks.bodyDisposed.mockClear(); hooks.pose = null; hooks.block = null;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { engine?.dispose(); engine = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start(category: string, options: ConstructorParameters<typeof FaceEngine>[3] = {}) {
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
  engine = new FaceEngine(canvas, { category, glb_url: "/fixture.glb" } as Product, status, options);
  await engine.start("front");
  return { scene, module, status, xr, previousEnvironment, canvas, camera };
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
  it("swaps earrings and necklaces without restarting the webcam or pipeline", async () => {
    const { scene, module, xr } = await start("earring", { onSwipe: vi.fn() });
    expect(xr.FaceController.configure).toHaveBeenCalledWith(expect.objectContaining({ enableEars: true }));
    await engine!.setProduct({ category: "necklace", glb_url: "/neck.glb" } as Product);
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.6, z: 0, visibility: 1 }));
    points[11].x = 0.7; points[12].x = 0.3;
    hooks.pose!({ points, neck: { left: 0.44, right: 0.56, y: 0.5 }, width: 640, height: 480, time: performance.now() });
    module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(true);
    await engine!.setProduct({ category: "earring", glb_url: "/ear.glb" } as Product);
    module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(false);
    expect(scene.getObjectByName("/ear.glb")).toBeDefined();
    expect(xr.run).toHaveBeenCalledTimes(1);
    expect(xr.stop).not.toHaveBeenCalled();
    expect(xr.loadChunk).toHaveBeenCalledTimes(2);
  });
  it("renders a necklace with live shoulders and chin even before segmentation acquires a contour", async () => {
    const {scene,module}=await start("necklace");
    module.listeners!.find(l=>l.event==="facecontroller.faceupdated")!.process({detail:{
      id:1,transform:{position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:.1,scaledWidth:1},
      vertices:[],attachmentPoints:{chin:{position:{x:0,y:-.1,z:0}}},
    }});
    const points=Array.from({length:33},()=>({x:.5,y:.35,z:0,visibility:1}));
    points[11]={x:.7,y:.6,z:0,visibility:1};points[12]={x:.3,y:.6,z:0,visibility:1};
    hooks.pose!({points,width:640,height:480,time:performance.now(),neck:null,reference:{chinX:.5,chinY:.51}});
    module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(true);
  });
  it("bridges a measured slow inference interval but still expires a missing person", async () => {
    const {scene,module}=await start("necklace");
    module.listeners!.find(l=>l.event==="facecontroller.faceupdated")!.process({detail:{
      id:1,transform:{position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:.1,scaledWidth:1},
      vertices:[],attachmentPoints:{chin:{position:{x:0,y:-.1,z:0}}},
    }});
    const points=Array.from({length:33},()=>({x:.5,y:.35,z:0,visibility:1}));
    points[11]={x:.7,y:.6,z:0,visibility:1};points[12]={x:.3,y:.6,z:0,visibility:1};
    hooks.pose!({points,width:640,height:480,time:0,neck:null,reference:{chinX:.5,chinY:.51}});
    await vi.advanceTimersByTimeAsync(700);
    hooks.pose!({points,width:640,height:480,time:200,neck:{left:.44,right:.56,y:.5}});
    await vi.advanceTimersByTimeAsync(400);module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(true);
    await vi.advanceTimersByTimeAsync(700);module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(false);
  });
  it("clears the saved neck profile when a different face acquires the mirror",async()=>{
    const {module}=await start("necklace");
    const emit=(name:string,detail:unknown)=>module.listeners!.find(l=>l.event==="facecontroller."+name)!.process({detail});
    const face={id:1,transform:{position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1,scaledWidth:1},vertices:[],attachmentPoints:{}};
    emit("faceupdated",face);emit("facelost",{id:1});emit("faceupdated",{...face,id:2});
    expect(hooks.profileReset).toHaveBeenCalledTimes(1);
  });
  it("does not flash off when the face is reacquired while the body is still live",async()=>{
    const {scene,module}=await start("necklace");
    const emit=(name:string,detail:unknown)=>module.listeners!.find(l=>l.event==="facecontroller."+name)!.process({detail});
    const face={id:1,transform:{position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1,scaledWidth:1},vertices:[],attachmentPoints:{}};
    emit("faceupdated",face);
    const points=Array.from({length:33},()=>({x:.5,y:.4,z:0,visibility:1}));points[11].x=.7;points[12].x=.3;
    hooks.pose!({points,width:640,height:480,time:0,neck:{left:.44,right:.56,y:.5}});module.onUpdate!();
    emit("facelost",{id:1});emit("faceupdated",{...face,id:2});module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(true);
    expect(hooks.profileReset).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);module.onUpdate!();
    expect(scene.getObjectByName("GoldarBodyNecklace")!.visible).toBe(false);
  });
  it("preserves the current model on a failed replacement and ignores late older loads", async () => {
    const { scene, xr } = await start("earring", { onSwipe: vi.fn() });
    await expect(engine!.setProduct({ category: "necklace", glb_url: "/broken.glb" } as Product)).rejects.toThrow();
    expect(scene.getObjectByName("/fixture.glb")).toBeDefined();
    let release!: () => void;
    hooks.block = new Promise<void>((resolve) => { release = resolve; });
    const slow = engine!.setProduct({ category: "earring", glb_url: "/slow.glb" } as Product);
    expect(await engine!.setProduct({ category: "earring", glb_url: "/new.glb" } as Product)).toBe(true);
    release(); expect(await slow).toBe(false);
    expect(scene.getObjectByName("/new.glb")).toBeDefined();
    expect(scene.getObjectByName("/slow.glb")).toBeUndefined();
    expect(xr.stop).not.toHaveBeenCalled();
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

  it("keeps visitor ownership through face loss and transforms the composite, not the tracking camera",async()=>{
    const {scene,module,canvas,camera}=await start("necklace",{autoFrame:true});
    const projection=camera.projectionMatrix.toArray(),position=camera.position.toArray();
    module.onCameraStatusChange?.({status:'hasVideo',video:{videoWidth:640,videoHeight:480} as HTMLVideoElement});
    const face=(id:number):FaceData=>({id,transform:{position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1,scaledWidth:1},attachmentPoints:{},vertices:Array.from({length:40},(_,i)=>({x:Math.cos(i*Math.PI/20)*.12,y:Math.sin(i*Math.PI/20)*.18,z:0}))});
    const emit=(name:string,detail:unknown)=>module.listeners!.find(l=>l.event==='facecontroller.'+name)!.process({detail});
    for(let i=0;i<12;i++){emit('faceupdated',face(1));module.onUpdate!();await vi.advanceTimersByTimeAsync(100);}
    expect(canvas.style.transform).toContain('matrix(');expect(canvas.style.transform).not.toContain('NaN');
    const root=scene.getObjectByName('GoldarFaceJewelry')!;
    expect(hooks.profileReset).toHaveBeenCalledTimes(1);
    const samples=hooks.qualitySample.mock.calls.length;
    for(let i=0;i<8;i++){emit('faceupdated',face(1));await vi.advanceTimersByTimeAsync(100);}
    expect(hooks.qualitySample).toHaveBeenCalledTimes(samples);
    emit('facelost',{id:1});const other=face(2);other.transform.position.x=.1;emit('faceupdated',other);
    expect(root.visible).toBe(false);expect(root.position.x).toBe(0);
    await vi.advanceTimersByTimeAsync(1400);module.onUpdate!();emit('faceupdated',other);expect(root.position.x).toBe(0);expect(hooks.profileReset).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(800);module.onUpdate!();
    expect(canvas.style.transform).toBe('matrix(1,0,0,1,0,0)');
    await vi.advanceTimersByTimeAsync(350);emit('faceupdated',other);expect(root.position.x).toBe(.1);
    expect(camera.projectionMatrix.toArray()).toEqual(projection);expect(camera.position.toArray()).toEqual(position);
  });

  it("keeps necklace fitting active while image quality prevents automatic zoom",async()=>{
    const {scene,module}=await start("necklace",{autoFrame:true});
    hooks.qualityUsable=false;
    const points=Array.from({length:33},()=>({x:.5,y:.6,z:0,visibility:1}));points[11].x=.7;points[12].x=.3;
    hooks.pose!({points,neck:{left:.44,right:.56,y:.5},time:performance.now(),width:640,height:480});
    module.onUpdate!();
    expect(scene.getObjectByName('GoldarBodyNecklace')!.visible).toBe(true);
  });

  it("falls back to normal live fitting if optional framing quality is unavailable",async()=>{
    const {scene,module,canvas}=await start("necklace",{autoFrame:true});
    hooks.qualityFailed?.();
    const points=Array.from({length:33},()=>({x:.5,y:.6,z:0,visibility:1}));points[11].x=.7;points[12].x=.3;
    hooks.pose!({points,neck:{left:.44,right:.56,y:.5},time:performance.now(),width:640,height:480});module.onUpdate!();
    expect(scene.getObjectByName('GoldarBodyNecklace')!.visible).toBe(true);expect(canvas.style.transform).toBe('none');
  });

});
