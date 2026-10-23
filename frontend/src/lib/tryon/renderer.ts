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
  private image = document.createElement("canvas");
  private texture = new T.CanvasTexture(this.image);
  private environment: T.WebGLRenderTarget;
  private inner = 1;
  private disposed = false;
  private current: Intrinsics | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.camera.near = 0.005;
    this.camera.far = 20;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const pmrem = new T.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.texture.colorSpace = T.SRGBColorSpace;
    this.scene.background = this.texture;
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
  present(frame: HTMLCanvasElement, solved: SolvedHand | null, fit: number) {
    if (this.disposed) return;
    if (
      this.image.width !== frame.width ||
      this.image.height !== frame.height
    ) {
      this.image.width = frame.width;
      this.image.height = frame.height;
      this.texture.dispose();
      this.texture = new T.CanvasTexture(this.image);
      this.texture.colorSpace = T.SRGBColorSpace;
      this.scene.background = this.texture;
    }
    this.image.getContext("2d")!.drawImage(frame, 0, 0);
    this.texture.needsUpdate = true;
    if (!solved) {
      this.hide();
      return;
    }
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
    this.depth.visible = true;
  }
  hide() {
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
      this.canvas.width !== Math.round(w * dpr) ||
      this.canvas.height !== Math.round(h * dpr)
    )
      this.renderer.setSize(w, h, false);
    const iw = this.image.width,
      ih = this.image.height,
      cover = Math.max(w / iw, h / ih);
    this.texture.repeat.set(w / (iw * cover), h / (ih * cover));
    this.texture.offset.set(
      (1 - this.texture.repeat.x) / 2,
      (1 - this.texture.repeat.y) / 2,
    );
    if (this.current) {
      this.camera.projectionMatrix.copy(coverProjection(this.current, w, h));
      this.camera.projectionMatrixInverse
        .copy(this.camera.projectionMatrix)
        .invert();
    }
    this.renderer.render(this.scene, this.camera);
  }
  snapshot() {
    return this.canvas.toDataURL("image/png");
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
    this.texture.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
