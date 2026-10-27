/* Motion proposes a search crop; ONLY the learned hand model can confirm a
 * hand or trigger navigation. Crops retain their exact raw-video coordinates. */
self.createHandFocus = () => {
  let previous = null;
  return (rgba, imageWidth, imageHeight) => {
    const current = new Uint8Array(32 * 24);
    let count = 0,
      minX = 32,
      minY = 24,
      maxX = -1,
      maxY = -1;
    for (let i = 0; i < current.length; i++) {
      current[i] = Math.round(
        (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3,
      );
      if (previous && Math.abs(current[i] - previous[i]) > 28) {
        const x = i % 32,
          y = Math.floor(i / 32);
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    previous = current;
    if (count < 10 || count > current.length * 0.45) return null;
    const width = ((maxX - minX + 1) / 32) * imageWidth,
      height = ((maxY - minY + 1) / 24) * imageHeight;
    const side = Math.min(
      Math.min(imageWidth, imageHeight),
      Math.max(
        Math.min(imageWidth, imageHeight) * 0.58,
        Math.max(width, height) * 1.5,
      ),
    );
    const cx = ((minX + maxX + 1) / 64) * imageWidth,
      cy = ((minY + maxY + 1) / 48) * imageHeight;
    return {
      x: Math.max(0, Math.min(imageWidth - side, cx - side / 2)) / imageWidth,
      y: Math.max(0, Math.min(imageHeight - side, cy - side / 2)) / imageHeight,
      width: side / imageWidth,
      height: side / imageHeight,
    };
  };
};
self.mapHandFocus = (hands, roi) =>
  hands.map((hand) =>
    hand.map((p) => ({
      ...p,
      x: roi.x + p.x * roi.width,
      y: roi.y + p.y * roi.height,
      z: (p.z ?? 0) * roi.width,
    })),
  );
