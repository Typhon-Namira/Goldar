importScripts("/workers/face-quality-metrics.js");
const canvas = new OffscreenCanvas(96, 96),
  ctx = canvas.getContext("2d", { willReadFrequently: true });
self.onmessage = ({ data }) => {
  try {
    ctx.drawImage(data.frame, 0, 0, 96, 96);
    self.postMessage({
      type: "quality",
      id: data.id,
      time: data.time,
      ...self.faceQualityMetrics(ctx.getImageData(0, 0, 96, 96).data, 96, 96),
    });
  } catch {
    self.postMessage({
      type: "quality",
      id: data.id,
      time: data.time,
      usable: false,
    });
  } finally {
    data.frame.close();
  }
};
