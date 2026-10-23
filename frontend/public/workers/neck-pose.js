/* MediaPipe inference runs off the camera/render thread. */
var exports = {};
importScripts("/vendor/mediapipe/vision_bundle.js");
importScripts("/workers/neck-contour.js");
let tracker;
const canvas = new OffscreenCanvas(384, 384);
const pixels = canvas.getContext("2d", { willReadFrequently: true });
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const files = await exports.FilesetResolver.forVisionTasks(
        "/vendor/mediapipe/wasm",
      );
      tracker = await exports.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/models/tracking/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(384, 384),
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    }
  } else if (data.type === "frame") {
    try {
      const result = tracker.detectForVideo(data.frame, data.time);
      const points = result.landmarks[0] || [];
      const mask = result.segmentationMasks?.[0];
      if (canvas.width !== data.frame.width) canvas.width = data.frame.width;
      if (canvas.height !== data.frame.height)
        canvas.height = data.frame.height;
      pixels.drawImage(data.frame, 0, 0);
      const image = pixels.getImageData(0, 0, canvas.width, canvas.height);
      const person = mask
        ? {
            values: mask.getAsFloat32Array(),
            width: mask.width,
            height: mask.height,
          }
        : null;
      const neck = self.findNeckContour(
        points,
        image.data,
        canvas.width,
        canvas.height,
        person,
      );
      self.postMessage({ type: "pose", points, neck, time: data.time });
      result.close();
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    } finally {
      data.frame.close();
    }
  }
};
