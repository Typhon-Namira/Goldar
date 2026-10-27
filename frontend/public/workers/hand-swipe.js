/* Independent, bounded hand inference on the existing camera stream.
 * Re-detect palms in each image: persistent VIDEO ROIs can lock onto resting
 * hands and miss a newly raised/swiftly moving hand elsewhere in the frame.
 * Gesture identity and temporal continuity are handled by our palm tracks. */
var exports = {};
importScripts("/vendor/mediapipe/vision_bundle.js");
importScripts("/workers/hand-scene.js");
importScripts("/workers/hand-focus.js");
const sceneGuard = self.createHandSceneGuard();
const preview = new OffscreenCanvas(32, 24);
const previewContext = preview.getContext("2d", { willReadFrequently: true });
const focusMotion = self.createHandFocus();
const focusCanvas = new OffscreenCanvas(320, 320);
const focusContext = focusCanvas.getContext("2d");
let tracker,
  focus = null,
  focusUntil = 0;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const files = await exports.FilesetResolver.forVisionTasks(
        "/vendor/mediapipe/wasm",
      );
      tracker = await exports.HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/models/tracking/hand_landmarker_fast.task",
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(320, 320),
        runningMode: "IMAGE",
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.4,
      });
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    }
  } else if (data.type === "frame") {
    try {
      previewContext.drawImage(data.frame, 0, 0, 32, 24);
      const pixels = previewContext.getImageData(0, 0, 32, 24).data;
      const sceneChanged = sceneGuard(pixels);
      const motion = focusMotion(pixels, data.frame.width, data.frame.height);
      if (sceneChanged) {
        focus = null;
        focusUntil = 0;
      }
      const roi = sceneChanged
        ? null
        : motion || (data.time < focusUntil ? focus : null);
      let result, landmarks;
      if (roi) {
        focusContext.drawImage(
          data.frame,
          roi.x * data.frame.width,
          roi.y * data.frame.height,
          roi.width * data.frame.width,
          roi.height * data.frame.height,
          0,
          0,
          320,
          320,
        );
        result = tracker.detect(focusCanvas);
        if (result.landmarks.length) {
          landmarks = self.mapHandFocus(result.landmarks, roi);
          focus = roi;
          if (motion) focusUntil = data.time + 500;
        } else {
          result.close?.();
          result = null;
          focus = null;
          focusUntil = 0;
        }
      }
      if (!result) {
        result = tracker.detect(data.frame);
        landmarks = result.landmarks;
      }
      self.postMessage({
        type: "hands",
        landmarks,
        handedness: result.handedness.map((h) => h[0]?.categoryName),
        time: data.time,
        sceneChanged,
      });
      result.close?.();
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    } finally {
      data.frame.close();
    }
  }
};
