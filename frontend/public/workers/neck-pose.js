/* Shared-camera CPU pose and person silhouette, off the render thread. */
var exports = {};
importScripts("/vendor/mediapipe/vision_bundle.js");
importScripts("/workers/neck-contour.js");
let tracker, segmenter;
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
      segmenter = await exports.ImageSegmenter.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/models/tracking/selfie_segmenter.tflite",
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(384, 384),
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    }
  } else if (data.type === "frame") {
    let pose;
    try {
      pose = tracker.detectForVideo(data.frame, data.time);
      const points = pose.landmarks[0] || [];
      // Consume the borrowed mask inside the callback; only coordinates leave
      // the worker. No confidence-mask clone or image upload is necessary.
      segmenter.segmentForVideo(data.frame, data.time, (result) => {
        const mask = result.categoryMask;
        const person = mask
          ? {
              width: mask.width,
              height: mask.height,
              values: mask.getAsUint8Array(),
              category: true,
            }
          : null;
        const neck = self.findNeckContour(
          points,
          null,
          data.frame.width,
          data.frame.height,
          person,
          data.region,
        );
        self.postMessage({ type: "pose", points, neck, time: data.time });
      });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    } finally {
      pose?.close();
      data.frame.close();
    }
  }
};
