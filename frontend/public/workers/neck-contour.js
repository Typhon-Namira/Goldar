/* Local, person-specific skin boundary inside the pose-defined neck band.
 * No skin-tone constants: compare chroma against this person's cheek pixels. */
self.findNeckContour = (points, pixels, width, height, person) => {
  if (!points[12] || !points[10] || !points[8] || !points[0]) return null;
  if ((points[0].visibility ?? 0) < 0.5) return null;
  const color = (x, y) => {
    const i =
      (Math.max(0, Math.min(height - 1, Math.round(y * height))) * width +
        Math.max(0, Math.min(width - 1, Math.round(x * width)))) *
      4;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    return [
      0.299 * r + 0.587 * g + 0.114 * b,
      128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
      128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
    ];
  };
  const nose = points[0],
    mouthY = (points[9].y + points[10].y) / 2;
  const colors = [];
  for (const ear of [points[7], points[8]]) {
    const x = nose.x + (ear.x - nose.x) * 0.42,
      y = (nose.y + mouthY) / 2;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        colors.push(color(x + dx / width, y + dy / height));
  }
  const reference = [0, 1, 2].map(
    (axis) =>
      colors.map((c) => c[axis]).sort((a, b) => a - b)[
        Math.floor(colors.length / 2)
      ],
  );
  if (reference[0] < 20) return null;
  const skin = (x, y) => {
    const c = color(x, y);
    if (
      person &&
      person.values[
        Math.min(person.height - 1, Math.floor(y * person.height)) *
          person.width +
          Math.min(person.width - 1, Math.floor(x * person.width))
      ] < 0.65
    )
      return false;
    return (
      Math.hypot(c[1] - reference[1], c[2] - reference[2]) < 22 &&
      c[0] > reference[0] * 0.4 &&
      c[0] < reference[0] * 2
    );
  };
  const shoulderWidth = Math.abs(points[11].x - points[12].x);
  const shoulderY = (points[11].y + points[12].y) / 2;
  const centerX =
    (points[11].x + points[12].x + points[9].x + points[10].x) / 4;
  const candidates = [];
  for (let i = 0; i < 32; i++) {
    const y = mouthY + (shoulderY - mouthY) * (0.3 + i * 0.0175);
    if (y <= 0 || y >= 1 || !skin(centerX, y)) continue;
    let left = centerX,
      right = centerX,
      gaps = 0;
    while (left > 0.01 && gaps < 2) {
      left -= 1 / width;
      gaps = skin(left, y) ? 0 : gaps + 1;
    }
    left += Math.max(0, gaps - 0.5) / width;
    gaps = 0;
    while (right < 0.99 && gaps < 2) {
      right += 1 / width;
      gaps = skin(right, y) ? 0 : gaps + 1;
    }
    right -= Math.max(0, gaps - 0.5) / width;
    const span = right - left;
    if (span > shoulderWidth * 0.19 && span < shoulderWidth * 0.48)
      candidates.push({ left, right, y, width: span });
  }
  candidates.sort((a, b) => a.width - b.width);
  return candidates.length >= 3
    ? candidates[Math.floor(candidates.length * 0.4)]
    : null;
};
