/* Independent, bounded hand inference on the existing camera stream. */
var exports = {};
importScripts('/vendor/mediapipe/vision_bundle.js');
let tracker;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const files = await exports.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      tracker = await exports.HandLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath:'/models/tracking/hand_landmarker_lite.task',delegate:'CPU'},
        canvas:new OffscreenCanvas(320,320), runningMode:'VIDEO', numHands:1,
        minHandDetectionConfidence:0.4,minHandPresenceConfidence:0.4,minTrackingConfidence:0.4,
      });
      self.postMessage({type:'ready'});
    } catch(error) {self.postMessage({type:'error',message:String(error)});}
  } else if (data.type === 'frame') {
    try {
      const result = tracker.detectForVideo(data.frame,data.time);
      self.postMessage({type:'hands',landmarks:result.landmarks,time:data.time});
      result.close?.();
    } catch(error) {self.postMessage({type:'error',message:String(error)});}
    finally {data.frame.close();}
  }
};
