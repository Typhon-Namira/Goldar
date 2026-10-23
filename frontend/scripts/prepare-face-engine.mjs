import { fileURLToPath } from "node:url";
import { cp, mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = dirname(require.resolve("@8thwall/engine/package.json"));
const output = resolve(root, "public/vendor/8thwall");
await mkdir(output, { recursive: true });
await cp(resolve(packageRoot, "dist"), output, { recursive: true });
await copyFile(resolve(packageRoot, "LICENSE"), resolve(output, "LICENSE.txt"));
console.log(
  "8th Wall MIT engine and face/ear models prepared for same-origin hosting",
);

const threeRoot = resolve(dirname(require.resolve("three")), "..");
const dracoOutput = resolve(root, "public/vendor/three/draco");
await mkdir(dracoOutput, { recursive: true });
await cp(resolve(threeRoot, "examples/jsm/libs/draco/gltf"), dracoOutput, {
  recursive: true,
});
await copyFile(
  resolve(threeRoot, "LICENSE"),
  resolve(root, "public/vendor/three/LICENSE.txt"),
);

const visionRoot = dirname(require.resolve("@mediapipe/tasks-vision"));
const visionOutput = resolve(root, "public/vendor/mediapipe");
await mkdir(visionOutput, { recursive: true });
await copyFile(
  resolve(visionRoot, "vision_bundle.cjs"),
  resolve(visionOutput, "vision_bundle.js"),
);
await cp(resolve(visionRoot, "wasm"), resolve(visionOutput, "wasm"), {
  recursive: true,
});
