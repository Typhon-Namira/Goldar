import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { inspectRingGeometry, attachCalibratedRing } from "../ringCalibration";
import type { Product } from "../api";
import type { SolvedHand } from "./tracking";
import type { Intrinsics } from "./protocol";
import { coverProjection } from "./camera";
export class RingRenderer {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera();
  private pivot = new T.Group();
  private depth = new T.Mesh(
    new T.BufferGeometry(),
    new T.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: T.DoubleSide,
    }),
  );
  private environment: T.WebGLRenderTarget;
  private inner = 1;
  private disposed = false;
  private current: Intrinsics | null = null;
  private dirty = true;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.camera.near = 0.005;
    this.camera.far = 20;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const pmrem = new T.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x423831, 1.2));
    const key = new T.DirectionalLight(0xffefd9, 2.5);
    key.position.set(-1, 2, 2);
    this.scene.add(key);
    const rim = new T.DirectionalLight(0xe4edff, 1.5);
    rim.position.set(2, 1, -1);
    this.scene.add(rim);
    this.depth.renderOrder = -10;
    this.depth.frustumCulled = false;
    this.scene.add(this.depth, this.pivot);
    this.hide();
  }
  async load(product: Product) {
    const gltf = await new GLTFLoader().loadAsync(product.glb_url);
    if (this.disposed) {
      this.release(gltf.scene);
      return;
    }
    const calibration = inspectRingGeometry(gltf.scene, {
      ...gltf.scene.userData.ringCalibration,
      ...product.ring_calibration,
    });
    if (
      !Number.isFinite(calibration.innerDiameter) ||
      calibration.innerDiameter <= 0
    ) {
      this.release(gltf.scene);
      throw Error("Ring model requires valid geometry calibration");
    }
    this.inner = calibration.innerDiameter;
    // Preserve authored PBR metal, roughness, gemstone/transmission materials.
    this.pivot.add(attachCalibratedRing(gltf.scene, calibration));
  }
  present(solved: SolvedHand | null, fit: number) {
    if (this.disposed) return;
    if (!solved) {
      this.hide();
      return;
    }
    this.dirty = true;
    this.current = solved.hand.camera;
    const geometry = this.depth.geometry;
    const vertices = new Float32Array(
      solved.hand.vertices.flatMap((v) => [v[0], -v[1], -v[2]]),
    );
    const attr = geometry.getAttribute("position");
    if (attr?.count === 778) {
      (attr.array as Float32Array).set(vertices);
      attr.needsUpdate = true;
    } else
      geometry.setAttribute("position", new T.BufferAttribute(vertices, 3));
    // OpenCV -> Three is a proper 180° X rotation: preserve face winding.
    geometry.setIndex(solved.hand.faces.flat());
    this.pivot.position.copy(solved.position);
    this.pivot.quaternion.copy(solved.rotation);
    this.pivot.scale.setScalar((solved.diameter * fit) / this.inner);
    this.pivot.visible = true;
    this.depth.visible = solved.occlusionReliable;
  }
  hide() {
    this.dirty = true;
    this.pivot.visible = false;
    this.depth.visible = false;
  }
  render() {
    if (this.disposed) return;
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    const dpr = this.renderer.getPixelRatio();
    if (
      this.canvas.width !== Math.floor(w * dpr) ||
      this.canvas.height !== Math.floor(h * dpr)
    ) {
      this.renderer.setSize(w, h, false);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    if (this.current) {
      this.camera.projectionMatrix.copy(coverProjection(this.current, w, h));
      this.camera.projectionMatrixInverse
        .copy(this.camera.projectionMatrix)
        .invert();
    }
    this.renderer.render(this.scene, this.camera);
  }
  snapshot(video: HTMLVideoElement, mirrored: boolean) {
    // Video is composited by the browser during preview, and explicitly here
    // for export. Use the same cover crop and mirror for both layers.
    this.dirty = true;
    this.render();
    const output = document.createElement("canvas");
    output.width = this.canvas.width;
    output.height = this.canvas.height;
    const ctx = output.getContext("2d");
    if (!ctx || !video.videoWidth || !video.videoHeight)
      throw Error("Camera frame is not ready");
    if (mirrored) {
      ctx.translate(output.width, 0);
      ctx.scale(-1, 1);
    }
    const scale = Math.max(
      output.width / video.videoWidth,
      output.height / video.videoHeight,
    );
    const w = video.videoWidth * scale,
      h = video.videoHeight * scale;
    ctx.drawImage(video, (output.width - w) / 2, (output.height - h) / 2, w, h);
    ctx.drawImage(this.canvas, 0, 0);
    return output.toDataURL("image/png");
  }
  private release(root: T.Object3D) {
    const textures = new Set<T.Texture>(),
      materials = new Set<T.Material>(),
      geometries = new Set<T.BufferGeometry>();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    materials.forEach((m) => {
      Object.values(m).forEach((v) => {
        if (v instanceof T.Texture) textures.add(v);
      });
      m.dispose();
    });
    textures.forEach((t) => t.dispose());
    geometries.forEach((g) => g.dispose());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release(this.scene);
    this.environment.dispose();
    this.renderer.dispose();
  }
}
