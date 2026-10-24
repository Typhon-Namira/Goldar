// Original Goldar cable-chain necklace: instanced links, pear-cut emerald,
// diamond halo, gold basket/prongs, articulated bail and rear clasp.
import * as T from "three";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const views = [],
  accessors = [],
  chunks = [],
  meshes = [],
  nodes = [],
  materials = [];
let offset = 0;
const material = (name, color, metallic, roughness, extensions = {}) => {
  materials.push({
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [...color, 1],
      metallicFactor: metallic,
      roughnessFactor: roughness,
    },
    extensions,
  });
  return materials.length - 1;
};
const gold = material("18k polished yellow gold", [0.95, 0.65, 0.23], 1, 0.17, {
  KHR_materials_clearcoat: {
    clearcoatFactor: 0.7,
    clearcoatRoughnessFactor: 0.13,
  },
});
const emerald = material(
  "Faceted deep emerald",
  [0.018, 0.19, 0.095],
  0.05,
  0.065,
  {
    KHR_materials_ior: { ior: 1.58 },
    KHR_materials_clearcoat: {
      clearcoatFactor: 1,
      clearcoatRoughnessFactor: 0.035,
    },
  },
);
const diamond = material(
  "Brilliant diamond halo",
  [0.95, 0.98, 1],
  0.08,
  0.045,
  {
    KHR_materials_ior: { ior: 2.417 },
    KHR_materials_clearcoat: {
      clearcoatFactor: 1,
      clearcoatRoughnessFactor: 0.02,
    },
  },
);
function attribute(array, itemSize) {
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength),
    view = views.length;
  views.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  chunks.push(data);
  offset += data.length;
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    offset += padding;
  }
  const type = itemSize === 1 ? "SCALAR" : `VEC${itemSize}`,
    componentType =
      array instanceof Uint32Array
        ? 5125
        : array instanceof Uint16Array
          ? 5123
          : 5126;
  const result = {
    bufferView: view,
    componentType,
    count: array.length / itemSize,
    type,
  };
  if (itemSize === 3) {
    result.min = [Infinity, Infinity, Infinity];
    result.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i++) {
      const k = i % 3;
      result.min[k] = Math.min(result.min[k], array[i]);
      result.max[k] = Math.max(result.max[k], array[i]);
    }
  }
  accessors.push(result);
  return accessors.length - 1;
}
function mesh(geometry, mat) {
  const attributes = {
    POSITION: attribute(geometry.attributes.position.array, 3),
    NORMAL: attribute(geometry.attributes.normal.array, 3),
  };
  const primitive = { attributes, material: mat };
  if (geometry.index) primitive.indices = attribute(geometry.index.array, 1);
  meshes.push({ primitives: [primitive] });
  return meshes.length - 1;
}
function node(name, meshIndex, parent, translation, rotation) {
  const n = { name };
  if (meshIndex !== undefined) n.mesh = meshIndex;
  if (translation) n.translation = translation;
  if (rotation) n.rotation = rotation;
  nodes.push(n);
  const i = nodes.length - 1;
  if (parent !== undefined) (nodes[parent].children ??= []).push(i);
  return i;
}
function instance(name, geometry, mat, poses, parent) {
  const m = mesh(geometry, mat),
    n = node(name, m, parent);
  const translations = new Float32Array(poses.length * 3),
    rotations = new Float32Array(poses.length * 4),
    scales = new Float32Array(poses.length * 3);
  poses.forEach((p, i) => {
    translations.set(p.p, i * 3);
    rotations.set(p.q ?? [0, 0, 0, 1], i * 4);
    scales.set(p.s ?? [1, 1, 1], i * 3);
  });
  nodes[n].extensions = {
    EXT_mesh_gpu_instancing: {
      attributes: {
        TRANSLATION: attribute(translations, 3),
        ROTATION: attribute(rotations, 4),
        SCALE: attribute(scales, 3),
      },
    },
  };
  return n;
}
const root = node("GoldarEmeraldHaloNecklace");
function path(t) {
  const a = t * Math.PI * 2,
    s = Math.sin(a),
    y = s < 0 ? 9 * (-s) ** 1.2 : -50 * s ** 1.8;
  const taper = 1 - 0.1 * Math.max(0, Math.min(1, y / 90));
  const x = (48 * taper + 3) * Math.cos(a);
  let z = (48 * 0.78 * taper + 3) * s;
  if (s > 0) {
    const rx = 48 + Math.min(-y, 130) * 1.05,
      d = 48 * 0.78 + Math.min(-y, 90) * 0.32;
    if (Math.abs(x) < rx) z = Math.max(z, d * Math.sqrt(1 - (x / rx) ** 2) + 3);
  }
  return new T.Vector3(x, y, z).multiplyScalar(0.001);
}

const link = new T.TorusGeometry(0.0009, 0.00022, 8, 20);
link.scale(1, 1.65, 1);
const poses = [];
for (let i = 0; i < 224; i++) {
  const t = i / 224,
    tangent = path(t + 0.0001)
      .sub(path(t - 0.0001))
      .normalize();
  const q = new T.Quaternion()
    .setFromUnitVectors(new T.Vector3(0, 1, 0), tangent)
    .multiply(
      new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        i % 2 ? Math.PI * 0.32 : -Math.PI * 0.32,
      ),
    );
  poses.push({ p: path(t).toArray(), q: q.toArray() });
}
instance("ChainLinks", link, gold, poses, root);
const pendant = node("PendantAssembly", undefined, root, path(0.25).toArray());
const bail = new T.TorusGeometry(0.00145, 0.00035, 10, 28);
bail.scale(0.78, 1.4, 1);
bail.translate(0, -0.002, 0);
node("ArticulatedGoldBail", mesh(bail, gold), pendant);
const shape = new T.Shape();
shape.moveTo(0, 0.009);
shape.bezierCurveTo(0.004, 0.006, 0.008, -0.001, 0.006, -0.006);
shape.bezierCurveTo(0.003, -0.01, -0.003, -0.01, -0.006, -0.006);
shape.bezierCurveTo(-0.008, -0.001, -0.004, 0.006, 0, 0.009);
const outline = shape.getSpacedPoints(32).slice(0, -1).reverse();
function cutStone(points, depthScale = 1) {
  const rings = [
      { s: 0.58, z: 0.0025 },
      { s: 1, z: 0.0005 },
      { s: 0.98, z: 0 },
      { s: 0.12, z: -0.003 },
    ],
    positions = [],
    indices = [];
  for (const ring of rings)
    for (const p of points)
      positions.push(p.x * ring.s, p.y * ring.s, ring.z * depthScale);
  const n = points.length;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, c, b, b, c, d);
    }
  positions.push(0, 0, rings[0].z * depthScale);
  const center = positions.length / 3 - 1;
  for (let i = 0; i < n; i++) indices.push(center, i, (i + 1) % n);
  positions.push(0, 0, -0.0036 * depthScale);
  const back = positions.length / 3 - 1;
  for (let i = 0; i < n; i++)
    indices.push(
      back,
      (rings.length - 1) * n + ((i + 1) % n),
      (rings.length - 1) * n + i,
    );
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
node(
  "PearCutEmerald",
  mesh(cutStone(outline), emerald),
  pendant,
  [0, -0.014, 0],
);
function outlineTube(factor, z, radius) {
  const curve = new T.CatmullRomCurve3(
    outline.map((p) => new T.Vector3(p.x * factor, p.y * factor - 0.014, z)),
    true,
  );
  return new T.TubeGeometry(curve, 96, radius, 10, true);
}
node(
  "InnerGoldBezel",
  mesh(outlineTube(1.055, 0.00045, 0.00045), gold),
  pendant,
);
node("HaloOuterRim", mesh(outlineTube(1.3, 0.0002, 0.00032), gold), pendant);
node("OpenworkBasket", mesh(outlineTube(0.95, -0.002, 0.0004), gold), pendant);
const round = Array.from(
  { length: 12 },
  (_, i) =>
    new T.Vector2(
      Math.cos((i / 12) * Math.PI * 2) * 0.0007,
      Math.sin((i / 12) * Math.PI * 2) * 0.0007,
    ),
);
const halo = [];
for (let i = 0; i < outline.length; i++) {
  const p = outline[i];
  halo.push({ p: [p.x * 1.19, p.y * 1.19 - 0.014, 0.0008] });
}
instance("DiamondHalo", cutStone(round, 0.12), diamond, halo, pendant);
const prongs = [];
for (const i of [2, 10, 18, 26]) {
  const p = outline[i];
  prongs.push({
    p: [p.x, p.y - 0.014, 0.001],
    q: new T.Quaternion()
      .setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2)
      .toArray(),
  });
}
instance(
  "GoldProngs",
  new T.CylinderGeometry(0.00028, 0.00034, 0.0035, 8),
  gold,
  prongs,
  pendant,
);
const clasp = node("ClaspAssembly", undefined, root, path(0.75).toArray());
const claspGeo = new T.TorusGeometry(0.0015, 0.0004, 10, 28);
claspGeo.scale(2.2, 1, 1);
claspGeo.rotateX(Math.PI / 2);
node("LobsterClasp", mesh(claspGeo, gold), clasp);
const latch = new T.CylinderGeometry(0.00035, 0.00035, 0.004, 10);
latch.rotateZ(Math.PI / 2);
node("ClaspLatch", mesh(latch, gold), clasp, [0.002, 0, 0]);
const binary = Buffer.concat(chunks);
const document = {
  asset: { version: "2.0", generator: "Goldar original Emerald Halo necklace" },
  scene: 0,
  scenes: [{ nodes: [root], extras: { goldarNecklaceRig: 2 } }],
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: binary.length }],
  extensionsUsed: [
    "EXT_mesh_gpu_instancing",
    "KHR_materials_clearcoat",
    "KHR_materials_ior",
  ],
  extensionsRequired: ["EXT_mesh_gpu_instancing"],
};
const json = Buffer.from(JSON.stringify(document)),
  padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]),
  bin = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + bin.length, 8);
const j = Buffer.alloc(8);
j.writeUInt32LE(padded.length);
j.writeUInt32LE(0x4e4f534a, 4);
const b = Buffer.alloc(8);
b.writeUInt32LE(bin.length);
b.writeUInt32LE(0x004e4942, 4);
await writeFile(
  fileURLToPath(
    new URL("../public/models/sample-necklace.glb", import.meta.url),
  ),
  Buffer.concat([header, j, padded, b, bin]),
);
console.log(
  `Emerald Halo necklace: ${binary.length} geometry bytes, ${nodes.length} nodes, instanced gold links and pavé stones.`,
);
