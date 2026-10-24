import { NecklaceRig } from "./necklace-rig";
import { neckSurface } from "./neck-surface";
import { StableNeckFrame } from "./body-stability";
import { BodyPoseTracker } from "./body-pose";
import { fitNeck, videoPoint, type NeckFit } from "./neck-fit";
import { createNeckOccluder, updateNeckOccluder } from "./neck-occlusion";
import { LobeStabilizer } from "./stabilization";
import { LobeSurface } from "./ear-occlusion";
import { validPoint, attachmentPlan, EarLobeTracking } from "./attachments";
import { defaultCalibration, resolveCalibration } from "./config";
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
  private lobeSurfaces: LobeSurface[] = [];
  private neckDepth: ReturnType<typeof createNeckOccluder> | null = null;
  private necklaceRig: NecklaceRig | null = null;
  private materialsReady = false;
  private faceChin: T.Vector3 | null = null;
  private neckAnchorCorrection = 0;
  private neckRoot = new T.Group();
  private body: BodyPoseTracker | null = null;
  private neckFit: NeckFit | null = null;
  private bodyError = "";
  private bodyStability = new StableNeckFrame();
  private sceneCamera: T.PerspectiveCamera | null = null;
  private facing: "front" | "back" = "front";
  private necklaceHalfWidth = 58;
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
    if (product.category === "earring")
      this.lobeSurfaces = [new LobeSurface(), new LobeSurface()];
    this.root.name = "GoldarFaceJewelry";
    this.left.name = "GoldarLeftJewelry";
    this.right.name = "GoldarRightJewelry";
    this.calibration = resolveCalibration(product);
  }
  setFit(value: number) {
    this.fit = T.MathUtils.clamp(value, 0.7, 1.3);
  }
  async start(facing: "front" | "back") {
    this.facing = facing;
    this.status(
      this.product.category === "necklace"
        ? "Loading camera and body tracking…"
        : "Loading face and ear tracking…",
    );
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
        .loadAsync(
          this.product.glb_url === "/models/sample-necklace.glb"
            ? this.product.glb_url + "?v=emerald-halo-rig2"
            : this.product.glb_url,
        );
    } finally {
      draco.dispose();
    }

    if (this.disposed) {
      disposeModel(gltf.scene);
      return;
    }
    this.model = gltf.scene;
    if (
      this.product.category === "necklace" &&
      gltf.scene.userData.goldarNecklaceRig === 2
    ) {
      this.necklaceRig = new NecklaceRig(gltf.scene);
      this.left.add(this.necklaceRig.root);
    } else this.left.add(prepareJewelry(clone(gltf.scene), this.calibration));
    if (this.product.category === "earring")
      this.right.add(prepareJewelry(clone(gltf.scene), this.calibration));
    if (this.product.category === "earring") {
      this.lobeSurfaces.forEach(({ group }) => {
        group.visible = false;
        this.root.add(group);
      });
    }
    if (this.product.category === "necklace") {
      if (!this.necklaceRig) {
        const bounds = new T.Box3().setFromObject(this.left);
        this.necklaceHalfWidth = Math.max(
          1,
          (bounds.max.x - bounds.min.x) * 80,
        );
      }
      this.neckDepth = createNeckOccluder();
      this.neckRoot.name = "GoldarBodyNecklace";
      this.neckRoot.add(this.left, this.neckDepth);
      this.neckRoot.visible = false;
      this.body = new BodyPoseTracker(
        (pose) => {
          if (!this.sceneCamera || this.disposed || !pose.neck) return;
          const camera = this.sceneCamera;
          let depth = 1;
          if (this.lastSeen && performance.now() - this.lastSeen < 2000) {
            const view = this.root.position
              .clone()
              .applyMatrix4(camera.matrixWorldInverse);
            depth = Math.max(0.2, -view.z);
          }
          let fit = fitNeck(
            pose,
            { width: this.canvas.width, height: this.canvas.height },
            camera,
            depth,
            this.facing === "front",
          );
          if (fit) {
            const up = new T.Vector3(0, 1, 0).applyQuaternion(fit.rotation);
            const view = camera
              .getWorldPosition(new T.Vector3())
              .sub(this.root.position)
              .normalize();
            const frontal =
              new T.Vector3(0, 0, -1)
                .applyQuaternion(this.root.quaternion)
                .dot(view) > 0.9;
            if (
              this.faceChin &&
              frontal &&
              performance.now() - this.lastSeen < 350
            ) {
              const bounded = fitNeck(
                pose,
                { width: this.canvas.width, height: this.canvas.height },
                camera,
                depth,
                this.facing === "front",
                this.faceChin,
              );
              if (bounded) {
                this.neckAnchorCorrection =
                  bounded.position.clone().sub(fit.position).dot(up) / fit.mm;
                fit = bounded;
              }
            } else
              fit.position.addScaledVector(
                up,
                this.neckAnchorCorrection * fit.mm,
              );
            this.neckFit = fit;
          }
        },
        (message) => {
          this.bodyError = message;
        },
        (width, height) => {
          if (
            !this.faceChin ||
            !this.sceneCamera ||
            performance.now() - this.lastSeen > 350
          )
            return null;
          const point = videoPoint(
            this.faceChin,
            { width, height },
            { width: this.canvas.width, height: this.canvas.height },
            this.sceneCamera,
            this.facing === "front",
          );
          return point.y > 0 && point.y < 1 ? { chinY: point.y } : null;
        },
      );
      this.root.add(this.occluder);
    } else this.root.add(this.left, this.right, this.occluder);
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
      onCameraStatusChange: ({ status, video }) => {
        if (status === "hasVideo" && video) this.body?.start(video);
      },
      onUpdate: () => this.updateBody(),
      onStart: () => {
        if (this.disposed) return;
        const { scene, renderer, camera } = xr.Threejs.xrScene();
        this.sceneCamera = camera;
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        this.environment = studioEnvironment();
        scene.environment = this.environment;
        scene.add(new T.HemisphereLight(0xffffff, 0x554533, 1.3));
        const light = new T.DirectionalLight(0xffeddb, 2);
        light.position.set(1, 2, 3);
        scene.add(light, this.root, this.neckRoot);
        if (this.necklaceRig) {
          void renderer
            .compileAsync(this.neckRoot, camera, scene)
            .then(() => {
              if (!this.disposed) this.materialsReady = true;
            })
            .catch(() => {
              if (!this.disposed)
                this.bodyError =
                  "Unable to prepare the necklace materials. Reload to retry.";
            });
        }
        this.status(
          this.body
            ? "Keep your neck and both shoulders in view."
            : "Look at the camera. Keep your face and ears in view.",
        );
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
              this.faceChin = null;
              if (!this.body)
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
        if (!this.body) this.status("Looking for your face…");
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
    if (this.faceId !== face.id) {
      this.lobeFilters.forEach((filter) => filter.reset());
      this.lobeSurfaces.forEach((surface) => surface.reset());
    }
    this.faceId = face.id;
    this.lastSeen = performance.now();
    this.root.position.set(t.position.x, t.position.y, t.position.z);
    this.root.quaternion.set(q.x, q.y, q.z, q.w).normalize();
    this.root.scale.setScalar(t.scale);
    const chin = face.attachmentPoints?.chin?.position;
    this.faceChin = validPoint(chin)
      ? this.root.localToWorld(new T.Vector3(chin.x, chin.y, chin.z))
      : null;
    const width =
      Number.isFinite(t.scaledWidth) && t.scaledWidth > 0 ? t.scaledWidth : 1;
    const offset = new T.Vector3(...this.calibration.offset_mm).multiplyScalar(
      width / 160,
    );
    const tracked = this.ears.apply(face);
    const place = (
      group: T.Group,
      point: { x: number; y: number; z: number } | undefined,
      visible: boolean,
      earIndex?: number,
    ) => {
      group.visible = visible && validPoint(point);
      if (earIndex !== undefined) {
        const surface = this.lobeSurfaces[earIndex];
        const depth = surface.group;
        const mm = validPoint(point)
          ? new T.Vector3(point.x, point.y, point.z).multiplyScalar(160 / width)
          : undefined;
        const stable =
          mm && visible
            ? this.lobeFilters[earIndex].update(mm, this.lastSeen)
            : this.lobeFilters[earIndex].hold(this.lastSeen);
        group.visible = depth.visible = !!stable;
        if (!stable) return;
        const side = earIndex === 0 ? "left" : "right";
        const landmark = (name: "Canal" | "Helix") => {
          const flag = `${side}${name}Found` as
            | "leftCanalFound"
            | "rightCanalFound"
            | "leftHelixFound"
            | "rightHelixFound";
          const position =
            tracked.attachmentPoints?.[`${side}${name}`]?.position;
          return tracked[flag] && validPoint(position)
            ? new T.Vector3(position.x, position.y, position.z).multiplyScalar(
                160 / width,
              )
            : undefined;
        };
        const insertion = surface.update(
          stable,
          landmark("Canal"),
          landmark("Helix"),
          this.lastSeen,
        );
        const local = stable.clone().multiplyScalar(width / 160);
        // Tissue and piercing share one stabilized anatomical frame. Merchant
        // model calibration and preview fit never move or resize the tissue.
        depth.position.copy(local);
        depth.scale.setScalar(width / 160);
        group.position
          .copy(stable)
          .add(insertion)
          .multiplyScalar(width / 160)
          .add(offset);
      } else {
        if (!group.visible) return;
        group.position.set(point!.x, point!.y, point!.z).add(offset);
      }
      group.scale.setScalar(width * this.fit);
    };
    const plan = attachmentPlan(
      tracked,
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
    }
    const vertices = face.vertices;
    if (vertices.every(validPoint) && this.occluder.geometry.index) {
      let attribute = this.occluder.geometry.getAttribute("position") as
        T.BufferAttribute | undefined;
      if (!attribute || attribute.count !== vertices.length) {
        attribute = new T.BufferAttribute(
          new Float32Array(vertices.length * 3),
          3,
        );
        attribute.setUsage(T.DynamicDrawUsage);
        this.occluder.geometry.setAttribute("position", attribute);
      }
      // Reuse the mesh buffer: per-frame flatMap/typed-array allocations cause
      // garbage-collection pauses on mobile during tracking.
      const positions = attribute.array as Float32Array;
      for (let i = 0; i < vertices.length; i++) {
        positions[i * 3] = vertices[i].x;
        positions[i * 3 + 1] = vertices[i].y;
        positions[i * 3 + 2] = vertices[i].z;
      }
      attribute.needsUpdate = true;
      this.occluder.visible = true;
    } else this.occluder.visible = false;
    this.root.visible = true;
  }
  private updateBody() {
    if (!this.body || this.disposed) return;
    const now = performance.now();
    if (this.necklaceRig && !this.materialsReady && !this.bodyError) {
      this.neckRoot.visible = false;
      this.status("Preparing the necklace finish…");
      return;
    }
    const target = this.neckFit;
    if (!target || now - target.time > 650 || this.bodyError) {
      this.neckRoot.visible = false;
      this.status(
        this.bodyError ||
          "Face the camera with your exposed neck and both shoulders visible.",
      );
      return;
    }
    const fit = this.bodyStability.update(target, now, !this.neckRoot.visible);
    this.neckRoot.position.copy(fit.position);
    this.neckRoot.quaternion.copy(fit.rotation);
    this.neckRoot.scale.setScalar(fit.mm);
    const baseline = defaultCalibration("necklace");
    this.left.position.set(
      this.calibration.offset_mm[0] - baseline.offset_mm[0],
      (this.necklaceRig ? 0 : 30) +
        this.calibration.offset_mm[1] -
        baseline.offset_mm[1],
      this.calibration.offset_mm[2] - baseline.offset_mm[2],
    );
    const surface = neckSurface(
      fit.radius,
      fit.height,
      ((50 * this.calibration.height_mm) / 85) * this.fit,
    );
    if (this.necklaceRig) {
      this.left.scale.setScalar(1);
      this.necklaceRig.update(surface, this.fit);
    } else {
      const horizontalFit = T.MathUtils.clamp(
        (fit.radius + 4) / this.necklaceHalfWidth,
        0.65,
        1.5,
      );
      this.left.scale.set(
        160 * this.fit * horizontalFit,
        160 * this.fit,
        160 * this.fit * horizontalFit,
      );
    }
    if (this.neckDepth) updateNeckOccluder(this.neckDepth, surface);
    this.left.visible = true;
    this.neckRoot.visible = true;
    this.status("Necklace preview · neck contour tracked");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.resizeObserver?.disconnect();
    this.body?.dispose();
    this.xr?.stop();
    this.root.removeFromParent();
    this.neckRoot.removeFromParent();
    disposeModel(this.neckRoot);
    disposeModel(this.root);
    if (this.model) disposeModel(this.model);
    this.environment?.dispose();
  }
}
