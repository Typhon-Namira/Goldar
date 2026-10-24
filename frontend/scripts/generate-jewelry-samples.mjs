// Original procedural demonstration assets; no external product models.
import { TorusGeometry, IcosahedronGeometry } from "three";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = fileURLToPath(new URL("../public/models/", import.meta.url));
await mkdir(output, { recursive: true });
for (const category of ["earring"]) {
  const hoop = new TorusGeometry(0.009, 0.001, 12, 64);
  const gem = new IcosahedronGeometry(0.004, 1);
  gem.translate(0, -0.015, 0);
  const views = [],
    accessors = [],
    chunks = [],
    primitives = [];
  let offset = 0;
  for (const [material, geometry] of [hoop, gem].entries()) {
    geometry.computeBoundingBox();
    const attributes = {};
    for (const [name, key] of [
      ["POSITION", "position"],
      ["NORMAL", "normal"],
    ]) {
      const attr = geometry.attributes[key],
        buffer = Buffer.from(
          attr.array.buffer,
          attr.array.byteOffset,
          attr.array.byteLength,
        );
      const view = views.length;
      views.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length });
      chunks.push(buffer);
      offset += buffer.length;
      attributes[name] = accessors.length;
      accessors.push({
        bufferView: view,
        componentType: 5126,
        count: attr.count,
        type: "VEC3",
        ...(name === "POSITION"
          ? {
              min: geometry.boundingBox.min.toArray(),
              max: geometry.boundingBox.max.toArray(),
            }
          : {}),
      });
    }
    let indices;
    if (geometry.index) {
      const array = geometry.index.array,
        buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
      const view = views.length;
      views.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length });
      chunks.push(buffer);
      offset += buffer.length;
      indices = accessors.length;
      accessors.push({
        bufferView: view,
        componentType: 5123,
        count: array.length,
        type: "SCALAR",
      });
      const pad = (4 - (offset % 4)) % 4;
      if (pad) {
        chunks.push(Buffer.alloc(pad));
        offset += pad;
      }
    }
    primitives.push({
      attributes,
      material,
      ...(indices !== undefined ? { indices } : {}),
    });
  }
  const binary = Buffer.concat(chunks),
    doc = {
      asset: { version: "2.0", generator: "Goldar original procedural sample" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives }],
      materials: [
        {
          name: "Gold",
          pbrMetallicRoughness: {
            baseColorFactor: [0.83, 0.58, 0.22, 1],
            metallicFactor: 1,
            roughnessFactor: 0.23,
          },
        },
        {
          name: "Blue gemstone",
          pbrMetallicRoughness: {
            baseColorFactor: [0.05, 0.27, 0.48, 1],
            metallicFactor: 0.15,
            roughnessFactor: 0.12,
          },
        },
      ],
      buffers: [{ byteLength: binary.length }],
      bufferViews: views,
      accessors,
    };
  const json = Buffer.from(JSON.stringify(doc)),
    jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 32),
    data = Buffer.concat([json, jsonPad]),
    binPad = Buffer.alloc((4 - (binary.length % 4)) % 4),
    bin = Buffer.concat([binary, binPad]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + data.length + 8 + bin.length, 8);
  const j = Buffer.alloc(8);
  j.writeUInt32LE(data.length, 0);
  j.writeUInt32LE(0x4e4f534a, 4);
  const b = Buffer.alloc(8);
  b.writeUInt32LE(bin.length, 0);
  b.writeUInt32LE(0x004e4942, 4);
  await writeFile(
    output + "sample-" + category + ".glb",
    Buffer.concat([header, j, data, b, bin]),
  );
}

await import("./generate-premium-necklace.mjs");
