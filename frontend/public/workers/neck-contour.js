/* Neck-band silhouette from the learned person mask. Shadows and complexion
 * never define the left/right boundary. Category 0 is person, 255 background. */
self.findNeckContour = (
  points,
  _pixels,
  imageWidth,
  imageHeight,
  person,
  region,
) => {
  if (
    !person ||
    !region ||
    !Number.isFinite(region.chinY) ||
    ![0, 9, 10, 11, 12].every(
      (i) =>
        points[i] &&
        Number.isFinite(points[i].x) &&
        Number.isFinite(points[i].y),
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
  const probability = (x, y) => {
    const xx = Math.max(0, Math.min(width - 1, x));
    const yy = Math.max(0, Math.min(height - 1, Math.floor(y * height)));
    return person.confidence
      ? person.confidence[yy * width + xx]
      : inside((xx + 0.5) / width, y)
        ? 1
        : 0;
  };
  // Use the tracked chin to seed the connected neck component. Averaging the
  // mouth and shoulders can seed the background when the head leans sideways.
  const seed = Number.isFinite(region.chinX) ? region.chinX : centerX;
  const rows = Math.min(96, Math.max(12, Math.ceil((end - start) * height)));
  for (let i = 0; i < rows; i++) {
    const y = start + ((end - start) * i) / (rows - 1);
    const cx = Math.floor(seed * width);
    if (probability(cx, y) < 0.65) continue;
    let l = cx,
      r = cx;
    while (l > 0 && probability(l - 1, y) >= 0.5) l--;
    while (r < width - 1 && probability(r + 1, y) >= 0.5) r++;
    if (l === 0 || r === width - 1) continue;
    // Interpolate the .5 isocontour rather than snapping attachments to mask
    // texels. Confidence arrays are borrowed only for this worker callback.
    const cross = (a, b) => {
      const pa = probability(a, y),
        pb = probability(b, y);
      return (a + 0.5 + (0.5 - pa) / (pb - pa)) / width;
    };
    const left = cross(l - 1, l),
      right = cross(r, r + 1);
    const span = right - left;
    if (span > shoulderWidth * 0.19 && span < shoulderWidth * 0.56)
      candidates.push({ left, right, y });
  }
  if (candidates.length < 5) return null;
  // Fit both boundaries over several adjacent upper-neck rows. One jagged
  // silhouette row or a shoulder flare must not define the whole neck volume.
  const targetY =
    start + Math.min((end - start) * 0.25, shoulderWidth * 0.04 * aspect);
  const band = candidates.filter(
    (p) =>
      Math.abs(p.y - targetY) <=
      Math.max(3 / height, shoulderWidth * 0.045 * aspect),
  );
  if (band.length < 3) return null;
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const fit = (key) => {
    const slopes = [];
    for (let i = 0; i < band.length; i++)
      for (let j = i + 1; j < band.length; j++)
        if (band[j].y - band[i].y > 1 / height)
          slopes.push((band[j][key] - band[i][key]) / (band[j].y - band[i].y));
    const slope = slopes.length ? median(slopes) : 0;
    const intercept = median(band.map((p) => p[key] - slope * (p.y - targetY)));
    const residual = median(
      band.map((p) => Math.abs(p[key] - intercept - slope * (p.y - targetY))),
    );
    return { value: intercept, residual };
  };
  const left = fit("left"),
    right = fit("right");
  if (
    Math.max(left.residual, right.residual) >
    Math.max(2 / width, shoulderWidth * 0.025)
  )
    return null;
  return { left: left.value, right: right.value, y: targetY };
};
