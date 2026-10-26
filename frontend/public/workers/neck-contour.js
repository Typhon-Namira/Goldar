/* Neck-band silhouette from the learned person mask. Shadows and complexion
 * never define the left/right boundary. Category 0 is person, 255 background. */
self.findNeckContour = (points, _pixels, imageWidth, imageHeight, person, region) => {
  if (
    !person ||
    !region ||
    !Number.isFinite(region.chinY) ||
    ![0, 9, 10, 11, 12].every((i) =>
      points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y)
    ) ||
    !(imageWidth > 0 && imageHeight > 0) ||
    (points[0].visibility ?? 0) < 0.5
  )
    return null;
  const { width, height, values } = person;
  const inside = (x, y) => {
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
    const value =
      values[
        Math.min(height - 1, Math.floor(y * height)) * width +
          Math.min(width - 1, Math.floor(x * width))
      ];
    return person.category ? value === 0 : value >= 0.5;
  };
  const mouthY = (points[9].y + points[10].y) / 2;
  const shoulderY = (points[11].y + points[12].y) / 2;
  const shoulderWidth = Math.abs(points[11].x - points[12].x);
  const centerX =
    (points[11].x + points[12].x + points[9].x + points[10].x) / 4;
  // The model mask is square even for a portrait/landscape camera. Normalized
  // landmark distances belong to the input image, not that tensor's aspect.
  const aspect = imageWidth / imageHeight;
  const start = Math.max(region.chinY + shoulderWidth * 0.08 * aspect, mouthY);
  const end = shoulderY - shoulderWidth * 0.04 * aspect;
  if (end - start < 2 / person.height) return null;
  const candidates = [];
  for (let i = 0; i < 40; i++) {
    const y = start + ((end - start) * i) / 39;
    if (!inside(centerX, y)) continue;
    let left = centerX,
      right = centerX,
      gaps = 0;
    while (left > 0.01 && gaps < 2) {
      left -= 1 / width;
      gaps = inside(left, y) ? 0 : gaps + 1;
    }
    left += Math.max(0, gaps - 0.5) / width;
    gaps = 0;
    while (right < 0.99 && gaps < 2) {
      right += 1 / width;
      gaps = inside(right, y) ? 0 : gaps + 1;
    }
    right -= Math.max(0, gaps - 0.5) / width;
    const span = right - left;
    if (span > shoulderWidth * 0.19 && span < shoulderWidth * 0.56)
      candidates.push({ left, right, y, width: span });
  }
  candidates.sort((a, b) => a.width - b.width);
  return candidates.length >= 3
    ? candidates[Math.floor(candidates.length * 0.25)]
    : null;
};
