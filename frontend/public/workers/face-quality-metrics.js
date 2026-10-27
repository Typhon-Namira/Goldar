/* Optical-quality proxies only; no identity, recognition or image upload. */
self.faceQualityMetrics = (pixels, width, height) => {
  const grey = new Float32Array(width * height);
  let mean = 0,
    black = 0,
    white = 0;
  for (let i = 0; i < grey.length; i++) {
    const v =
      pixels[i * 4] * 0.299 +
      pixels[i * 4 + 1] * 0.587 +
      pixels[i * 4 + 2] * 0.114;
    grey[i] = v;
    mean += v;
    if (v < 12) black++;
    if (v > 245) white++;
  }
  let sum = 0,
    squares = 0,
    n = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        v =
          grey[i - 1] +
          grey[i + 1] +
          grey[i - width] +
          grey[i + width] -
          4 * grey[i];
      sum += v;
      squares += v * v;
      n++;
    }
  mean /= Math.max(1, grey.length);
  const sharpness = Math.max(
    0,
    squares / Math.max(1, n) - (sum / Math.max(1, n)) ** 2,
  );
  return {
    sharpness,
    mean,
    usable:
      sharpness >= 25 &&
      mean >= 24 &&
      mean <= 232 &&
      black / grey.length < 0.55 &&
      white / grey.length < 0.35,
  };
};
