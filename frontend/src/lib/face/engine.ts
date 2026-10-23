import { LobeStabilizer } from "./stabilization";
import { createLobeOccluder, PIERCING_INSET_MM } from "./ear-occlusion";
import { validPoint, attachmentPlan, EarLobeTracking } from "./attachments";
import { defaultCalibration } from "./config";
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { studioEnvironment } from "./lighting";
import type { Product } from "../api";
import type {
  FaceData,
  GeometryData,
  XR8Engine,
  PipelineModule,
} from "./types";
import { prepareJewelry, disposeModel } from "./calibration";
let loadingEngine: Promise<XR8Engine> | null = null;
async function loadEngine(): Promise<XR8Engine> {
  window.THREE = { ...T, GLTFLoader };
  if (window.XR8) return window.XR8;
  if (loadingEngine) return loadingEngine;
  loadingEngine = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/8thwall/xr.js";
    script.async = true;
    const timer = setTimeout(
      () => finish(Error("Face engine loading timed out. Please retry.")),
      45000,
    );
    const ready = () => {
      if (window.XR8) finish();
    };
    const finish = (error?: Error) => {
      clearTimeout(timer);
      window.removeEventListener("xrloaded", ready);
      script.onerror = null;
      error ? reject(error) : resolve(window.XR8!);
    };
    window.addEventListener("xrloaded", ready);
    script.onerror = () => finish(Error("Unable to load the face engine."));
    document.head.appendChild(script);
  });
  return loadingEngine;
}
export class FaceEngine {
  private disposed = false;
  private xr: XR8Engine | null = null;
  private root = new T.Group();
  private left = new T.Group();
  private right = new T.Group();
  private lobeFilters = [new LobeStabilizer(), new LobeStabilizer()];
  private lobeDepth = [new T.Group(), new T.Group()];
  private occluder = new T.Mesh(
    new T.BufferGeometry(),
    new T.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: T.DoubleSide,
    }),
  );
  private model: T.Object3D | null = null;
  private environment: T.Texture | null = null;
  private faceId: number | null = null;
  private ears = new EarLobeTracking();
  private lastSeen = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private fit = 1;
  private resizeObserver: ResizeObserver | null = null;
  private calibration;
  constructor(
    private canvas: HTMLCanvasElement,
    private product: Product,
    private status: (s: string) => void,
  ) {
    this.root.name = "GoldarFaceJewelry";
    this.left.name = "GoldarLeftJewelry";
    this.right.name = "GoldarRightJewelry";
    this.calibration =
      product.face_calibration ?? defaultCalibration(product.category);
  }
  setFit(value: number) {
    this.fit = T.MathUtils.clamp(value, 0.7, 1.3);
  }
  async start(facing: "front" | "back") {
    this.status("Loading face and ear tracking…");
    const xr = await loadEngine();
    if (this.disposed) return;
    this.xr = xr;
    // The MIT image-target chunk initializes XrController camera utilities used
    // by the SDK Three.js bridge. Its historical name is "slam"; this is NOT
    // the separately licensed SLAM binary.
    await xr.loadChunk("slam");
    if (this.disposed) return;
    await xr.loadChunk("face");
    if (this.disposed) return;
    this.status("Loading your jewelry…");
    const draco = new DRACOLoader().setDecoderPath("/vendor/three/draco/");
    let gltf;
    try {
      gltf = await new GLTFLoader()
        .setDRACOLoader(draco)
        .setMeshoptDecoder(MeshoptDecoder)
        .loadAsync(this.product.glb_url);
    } finally {
      draco.dispose();
    }

    if (this.disposed) {
      disposeModel(gltf.scene);
      return;
    }
    this.model = gltf.scene;
    this.left.add(prepareJewelry(clone(gltf.scene), this.calibration));
    if (this.product.category === "earring")
      this.right.add(prepareJewelry(clone(gltf.scene), this.calibration));
    if (this.product.category === "earring") {
      this.lobeDepth.forEach((group) => {
        group.add(createLobeOccluder());
        group.visible = false;
        this.root.add(group);
      });
    }
    this.root.add(this.left, this.right, this.occluder);
    this.root.visible = false;
    this.occluder.renderOrder = -20;
    this.occluder.frustumCulled = false;
    xr.FaceController.configure({
      enableEars: this.product.category === "earring",
      maxDetections: 1,
      coordinates: { mirroredDisplay: facing === "front" },
    });
    const module: PipelineModule = {
      name: "goldar-face-jewelry",
      onStart: () => {
        if (this.disposed) return;
        const { scene, renderer } = xr.Threejs.xrScene();
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        this.environment = studioEnvironment();
        scene.environment = this.environment;
        scene.add(new T.HemisphereLight(0xffffff, 0x554533, 1.3));
        const light = new T.DirectionalLight(0xffeddb, 2);
        light.position.set(1, 2, 3);
        scene.add(light, this.root);
        this.status("Look at the camera. Keep your face and ears in view.");
      },
      onException: (error) => {
        if (!this.disposed) {
          this.root.visible = false;
          this.status(
            error instanceof Error
              ? error.message
              : "Camera tracking failed. Stop and retry.",
          );
        }
      },
      listeners: [
        {
          event: "facecontroller.faceloading",
          process: (e) => this.geometry(e.detail as GeometryData),
        },
        {
          event: "facecontroller.facefound",
          process: (e) => this.update(e.detail as FaceData),
        },
        {
          event: "facecontroller.faceupdated",
          process: (e) => this.update(e.detail as FaceData),
        },
        ...(["earpointfound", "earpointlost"] as const).map((event) => ({
          event: `facecontroller.${event}`,
          process: (e: { detail: unknown }) => {
            const data = e.detail as { id: number; point: string };
            this.ears.setPoint(data.id, data.point, event === "earpointfound");
          },
        })),
        {
          event: "facecontroller.facelost",
          process: (e) => {
            this.ears.clear((e.detail as { id: number }).id);
            if ((e.detail as { id: number }).id === this.faceId) {
              this.root.visible = false;
              this.faceId = null;
              this.status("Face lost. Look towards the camera.");
            }
          },
        },
      ],
    };
    xr.addCameraPipelineModules([
      xr.GlTextureRenderer.pipelineModule(),
      xr.Threejs.pipelineModule(),
      xr.FaceController.pipelineModule(),
      module,
    ]);
    this.watchdog = setInterval(() => {
      if (this.root.visible && performance.now() - this.lastSeen > 700) {
        this.root.visible = false;
        this.faceId = null;
        this.status("Looking for your face…");
      }
    }, 200);
    const resize = () => {
      const parent = this.canvas.parentElement;
      const width = Math.max(1, parent?.clientWidth ?? window.innerWidth);
      const height = Math.max(1, parent?.clientHeight ?? window.innerHeight);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    if (this.canvas.parentElement)
      this.resizeObserver.observe(this.canvas.parentElement);
    await xr.run({
      canvas: this.canvas,
      allowedDevices: "any",
      cameraConfig: { direction: facing },
      webgl2: true,
    });
  }
  private geometry(data: GeometryData) {
    if (this.disposed || !Array.isArray(data.indices)) return;
    this.occluder.geometry.setIndex(
      data.indices.flatMap((f) => [f.a, f.b, f.c]),
    );
  }
  private update(face: FaceData) {
    if (
      this.disposed ||
      !face?.transform ||
      !validPoint(face.transform.position) ||
      !Array.isArray(face.vertices)
    )
      return;
    if (this.faceId !== null && this.faceId !== face.id) return;
    const t = face.transform,
      q = t.rotation;
    if (
      !q ||
      ![q.x, q.y, q.z, q.w, t.scale].every(Number.isFinite) ||
      t.scale <= 0
    )
      return;
    if (this.faceId !== face.id)
      this.lobeFilters.forEach((filter) => filter.reset());
    this.faceId = face.id;
    this.lastSeen = performance.now();
    this.root.position.set(t.position.x, t.position.y, t.position.z);
    this.root.quaternion.set(q.x, q.y, q.z, q.w).normalize();
    this.root.scale.setScalar(t.scale);
    const width =
      Number.isFinite(t.scaledWidth) && t.scaledWidth > 0 ? t.scaledWidth : 1;
    const offset = new T.Vector3(...this.calibration.offset_mm).multiplyScalar(
      width / 160,
    );
    const place = (
      group: T.Group,
      point: { x: number; y: number; z: number } | undefined,
      visible: boolean,
      earIndex?: number,
    ) => {
      group.visible = visible && validPoint(point);
      if (earIndex !== undefined) {
        const depth = this.lobeDepth[earIndex];
        depth.visible = group.visible;
        if (!group.visible) {
          this.lobeFilters[earIndex].reset();
          return;
        }
        const mm = new T.Vector3(point!.x, point!.y, point!.z).multiplyScalar(
          160 / width,
        );
        const stable = this.lobeFilters[earIndex].update(mm, this.lastSeen);
        const local = stable.multiplyScalar(width / 160);
        // Tissue is fixed to the tracked lobe; preview/model calibration must
        // never move or resize the ear mask itself.
        depth.position.copy(local);
        depth.scale.setScalar(width / 160);
        group.position.copy(local).add(offset);
        group.position.y += (PIERCING_INSET_MM * width) / 160;
      } else {
        if (!group.visible) return;
        group.position.set(point!.x, point!.y, point!.z).add(offset);
      }
      group.scale.setScalar(width * this.fit);
    };
    const plan = attachmentPlan(
      this.ears.apply(face),
      this.product.category,
      this.calibration.side,
      this.calibration.ear_anchor,
    );
    if (this.product.category === "earring") {
      // Attach only to a detected lobe, never to the face-mesh ear landmark.
      place(this.left, plan.left, !!plan.left, 0);
      place(this.right, plan.right, !!plan.right, 1);
      this.status(
        this.left.visible || this.right.visible
          ? "Earring preview · tracked earlobe"
          : "Face found. Reveal your ears by moving hair aside.",
      );
    } else {
      place(this.left, plan.left, !!plan.left);
      this.right.visible = false;
      this.status(
        this.left.visible
          ? "Necklace preview · approximate placement follows your head"
          : "Face found. Keep your chin visible.",
      );
    }
    const vertices = face.vertices;
    if (vertices.every(validPoint) && this.occluder.geometry.index) {
      const positions = new Float32Array(
        vertices.flatMap((p) => [p.x, p.y, p.z]),
      );
      const previous = this.occluder.geometry.getAttribute("position");
      if (previous?.count === vertices.length) {
        (previous.array as Float32Array).set(positions);
        previous.needsUpdate = true;
      } else
        this.occluder.geometry.setAttribute(
          "position",
          new T.BufferAttribute(positions, 3),
        );
      this.occluder.visible = true;
    } else this.occluder.visible = false;
    this.root.visible = true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.resizeObserver?.disconnect();
    this.xr?.stop();
    this.root.removeFromParent();
    disposeModel(this.root);
    if (this.model) disposeModel(this.model);
    this.environment?.dispose();
  }
}
