import type * as THREE from "three";
export type Point = { x: number; y: number; z: number };
export type FaceData = {
  id: number;
  transform: {
    position: Point;
    rotation: { x: number; y: number; z: number; w: number };
    scale: number;
    scaledWidth: number;
  };
  vertices: Point[];
  attachmentPoints: Record<string, { position: Point }>;
  leftLobeFound?: boolean;
  rightLobeFound?: boolean;
  leftCanalFound?: boolean;
  rightCanalFound?: boolean;
  leftHelixFound?: boolean;
  rightHelixFound?: boolean;
  leftEarFound?: boolean;
  rightEarFound?: boolean;
};
export type GeometryData = { indices: { a: number; b: number; c: number }[] };
export type PipelineModule = {
  name: string;
  onStart?: () => void;
  onUpdate?: () => void;
  onCameraStatusChange?: (data: {
    status: string;
    video?: HTMLVideoElement;
  }) => void;
  onException?: (error: unknown) => void;
  listeners?: {
    event: string;
    process: (event: { detail: unknown }) => void;
  }[];
};
export type XR8Engine = {
  loadChunk: (name: string) => Promise<void>;
  addCameraPipelineModules: (modules: unknown[]) => void;
  run: (config: Record<string, unknown>) => Promise<void> | void;
  stop: () => void;
  FaceController: {
    configure: (options: Record<string, unknown>) => void;
    pipelineModule: () => unknown;
  };
  GlTextureRenderer: { pipelineModule: () => unknown };
  Threejs: {
    pipelineModule: () => unknown;
    xrScene: () => {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
    };
  };
  XrConfig?: { camera: () => { FRONT: string; BACK: string } };
};
declare global {
  interface Window {
    XR8?: XR8Engine;
    THREE?: typeof THREE & { GLTFLoader?: unknown };
  }
}
