import * as T from "three";
/** Local studio reflection map. Three.js prepares it during its own render
 * phase, not inside XR8's onStart where offscreen rendering can leak GL state. */
export function studioEnvironment() {
  const w = 256,
    h = 128,
    pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const box =
        (x > 35 && x < 65 && y > 22 && y < 92) ||
        (x > 170 && x < 190 && y > 35 && y < 95);
      const base = box ? 245 : Math.round(55 + 45 * (1 - y / h));
      const i = (y * w + x) * 4;
      pixels[i] = base;
      pixels[i + 1] = Math.round(base * 0.94);
      pixels[i + 2] = Math.round(base * 0.86);
      pixels[i + 3] = 255;
    }
  const texture = new T.DataTexture(pixels, w, h, T.RGBAFormat);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
