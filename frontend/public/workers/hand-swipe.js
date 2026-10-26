/* Independent, bounded hand inference on the existing camera stream. */
var exports = {};
importScripts('/vendor/mediapipe/vision_bundle.js');
importScripts('/workers/hand-scene.js');
const sceneGuard=self.createHandSceneGuard();
const preview=new OffscreenCanvas(32,24);
const previewContext=preview.getContext('2d',{willReadFrequently:true});
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
      previewContext.drawImage(data.frame,0,0,32,24);
      const sceneChanged=sceneGuard(previewContext.getImageData(0,0,32,24).data);
      const result = tracker.detectForVideo(data.frame,data.time);
      self.postMessage({type:'hands',landmarks:result.landmarks,time:data.time,sceneChanged});
      result.close?.();
    } catch(error) {self.postMessage({type:'error',message:String(error)});}
    finally {data.frame.close();}
  }
};
