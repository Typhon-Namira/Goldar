/**
 * Isolated anatomical anchor estimator. No camera, DOM, React, or WebGL state.
 * All inputs are per-frame observations and explicit calibration parameters.
 * Outputs are approximate camera-space geometry, not metric measurements.
 * Input image handedness convention must match the tracking adapter.
 */
import * as THREE from "three";
import type {FingerName, HandPoint, HandSide} from "../handPose";

/**
 * Camera-space ring solver. Every axis and the anchor use the same projected
 * image coordinate system (CSS pixels, +X right, +Y up, +Z toward viewer).
 * MediaPipe's hand-local world landmarks are deliberately not multiplied into
 * this camera pose: they have a different coordinate origin and orientation.
 *
 * Absolute finger diameter/depth is unobservable with monocular 21 landmarks;
 * the estimator keeps these as explicit calibrated approximations.
 */
export type CameraRingPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  fingerWidthPx: number;
  dorsal: THREE.Vector3;
  axis: THREE.Vector3;
  quality: number;
};
const JOINTS: Record<FingerName, readonly [number,number,number]> = {
  index:[5,6,7], middle:[9,10,11], ring:[13,14,15], pinky:[17,18,19],
};
const NEIGHBORS: Record<FingerName,readonly [number,number]> = {
  index:[5,9],middle:[5,13],ring:[9,17],pinky:[13,17],
};
const good=(p:HandPoint)=>p&&[p.x,p.y,p.z].every(Number.isFinite);

export function estimateAnatomicalRingAnchor(input:{
  landmarks: readonly HandPoint[];
  /** Relative 3D reconstruction; orientation only, not metric camera position. */
  worldLandmarks?: readonly HandPoint[];
  finger: FingerName;
  toScreen:(p:HandPoint)=>{x:number;y:number};
  width:number;height:number;
  holeDiameter:number;
  anchorFraction:number;
  fitMultiplier:number;
  widthCalibration:number;
  /** Set to 0 to disable uncertain model-relative depth. */
  depthFactor?:number;
  reportedSide?:HandSide;
  cameraFacing?:"environment"|"user";
  /** Previous accepted quaternion for temporal hemisphere continuity. */
  previousQuaternion?:THREE.Quaternion;
  /** Minimum geometric observability to accept this frame. */
  minimumQuality?:number;
}):CameraRingPose|null {
  const {landmarks, finger, toScreen, width,height,holeDiameter,
    anchorFraction,fitMultiplier,widthCalibration}=input;
  if(landmarks.length<21 || !landmarks.every(good) ||
    ![width,height,holeDiameter,anchorFraction,fitMultiplier,widthCalibration].every(Number.isFinite) ||
    width<=0||height<=0||holeDiameter<=1e-8||fitMultiplier<=0||widthCalibration<=0)return null;
  if(!(finger in JOINTS))return null;
  if(input.minimumQuality!==undefined && (!Number.isFinite(input.minimumQuality)||input.minimumQuality<0||input.minimumQuality>1))return null;
  const [m,p,d]=JOINTS[finger];
  // Map landmarks to a shared *camera* coordinate frame. The overlay uses
  // orthographic projection; Z is relative landmark displacement expressed
  // in CSS pixels, NOT physical camera distance.
  if(input.depthFactor!==undefined && !Number.isFinite(input.depthFactor)) return null;
  const depthFactor=THREE.MathUtils.clamp(input.depthFactor??0.3,0,1);
  const depthPx=Math.max(width,height)*depthFactor;
  const cameraPoint=(i:number)=>{
    const s=toScreen(landmarks[i]);
    if(!Number.isFinite(s.x)||!Number.isFinite(s.y)) return new THREE.Vector3(NaN,NaN,NaN);
    return new THREE.Vector3(s.x-width/2,height/2-s.y,-landmarks[i].z*depthPx);
  };
  const mcp=cameraPoint(m),pip=cameraPoint(p),dip=cameraPoint(d);
  const proximal=pip.clone().sub(mcp);
  const distal=dip.clone().sub(pip);
  if(![mcp,pip,dip].every(p=>[p.x,p.y,p.z].every(Number.isFinite)))return null;
  if(proximal.lengthSq()<4||distal.lengthSq()<1)return null;
  const axis=proximal.clone().normalize();
  const distalUnit=distal.clone().normalize();
  // The ring attaches to the proximal phalanx, not the bent distal phalanx.
  // DIP contributes only to geometry quality, not the mounting direction.
  const bend=axis.dot(distalUnit);

  // Anatomical palm-width vector determines the tangent-plane across direction.
  const index=cameraPoint(5),pinky=cameraPoint(17),wrist=cameraPoint(0);
  const across=index.clone().sub(pinky);
  const palmLength=cameraPoint(9).sub(wrist);
  const handBreadth=across.length();
  if(!Number.isFinite(handBreadth)||!Number.isFinite(palmLength.lengthSq())||handBreadth<5||palmLength.lengthSq()<4)return null;
  const lateral=across.clone().addScaledVector(axis,-across.dot(axis));
  const lateralSize=lateral.length();
  if(!Number.isFinite(lateralSize)||lateralSize<handBreadth*0.12)return null;
  lateral.normalize();

  // Index-to-pinky order defines the transverse anatomical axis. The cross
  // product's sign also depends on hand laterality: a RIGHT dorsal-facing
  // hand viewed by the rear camera needs the opposite sign from a LEFT one.
  // MediaPipe's handedness is documented for mirrored selfie imagery. For
  // ordinary unmirrored rear input, interchange the reported labels.
  // Unknown handedness cannot reliably resolve dorsal/volar orientation.
  const reported=input.reportedSide??"Unknown";
  const anatomicalSide:HandSide=input.cameraFacing==="environment"
    ?(reported==="Left"?"Right":reported==="Right"?"Left":"Unknown")
    :reported;
  if(anatomicalSide==="Unknown")return null;
  const dorsal=new THREE.Vector3().crossVectors(lateral,axis);
  if(anatomicalSide==="Right") dorsal.negate();
  if(dorsal.lengthSq()<1e-8)return null;
  dorsal.normalize();
  lateral.crossVectors(axis,dorsal).normalize();
  // Hand-local 3D landmarks provide relative segment orientation, never
  // camera-space translation. Resolve the local X/Y reflection using the
  // simultaneously observed screen-space MCP -> PIP direction.
  if(input.worldLandmarks?.length===21 && input.worldLandmarks.every(good)){
    const wp=input.worldLandmarks;
    const segment=new THREE.Vector3(
      wp[p].x-wp[m].x, -(wp[p].y-wp[m].y), -(wp[p].z-wp[m].z)
    );
    const acrossWorld=new THREE.Vector3(
      wp[5].x-wp[17].x, -(wp[5].y-wp[17].y), -(wp[5].z-wp[17].z)
    );
    if(segment.lengthSq()>1e-9 && acrossWorld.lengthSq()>1e-9){
      segment.normalize();
      // Reflection is chosen by the observed projected direction.
      if(segment.x*axis.x+segment.y*axis.y<0)segment.negate();
      const fusedAxis=axis.clone().lerp(segment,0.32).normalize();
      const transverse=acrossWorld.addScaledVector(fusedAxis,-acrossWorld.dot(fusedAxis));
      if(transverse.lengthSq()>1e-8){
        transverse.normalize();
        if(transverse.x*lateral.x+transverse.y*lateral.y<0)transverse.negate();
        const fusedLateral=lateral.clone().lerp(transverse,0.28);
        fusedLateral.addScaledVector(fusedAxis,-fusedLateral.dot(fusedAxis));
        if(fusedLateral.lengthSq()>1e-8){
          fusedLateral.normalize();
          const newDorsal=new THREE.Vector3().crossVectors(fusedLateral,fusedAxis).normalize();
          // Preserve the anatomical dorsal hemisphere. Never silently
          // switch gemstone from the back of the hand to the palm.
          if(newDorsal.dot(dorsal)<0){
            fusedLateral.negate();
            newDorsal.negate();
          }
          axis.copy(fusedAxis);
          lateral.copy(fusedLateral);
          dorsal.copy(newDorsal);
        }
      }
    }
  }
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(lateral,axis,dorsal)
  ).normalize();

  const t=THREE.MathUtils.clamp(anchorFraction,0.05,0.82);
  const position=mcp.clone().lerp(pip,t);
  // The renderer is a pixel-space orthographic projection. Relative depth
  // changes do not move the on-screen center and must remain bounded.
  position.z=0; // Fixed orthographic rendering plane; depth informs rotation only.

  const neighbor=NEIGHBORS[finger];
  const spacing=cameraPoint(neighbor[0]).distanceTo(cameraPoint(neighbor[1]));
  const widthProxy=Math.min(handBreadth*0.29,Math.max(handBreadth*0.16,spacing*0.68));
  // Projected landmark span grows with camera approach; preserve that natural scale.
  const fingerWidthPx=widthProxy*widthCalibration;
  const scale=fingerWidthPx/holeDiameter*fitMultiplier;
  if(!Number.isFinite(scale)||scale<=0||![position.x,position.y,position.z,quaternion.x,quaternion.y,quaternion.z,quaternion.w].every(Number.isFinite))return null;
  const quality=THREE.MathUtils.clamp(lateralSize/handBreadth,0,1)*
    THREE.MathUtils.clamp((bend+1)/2,0.25,1);
  if(!Number.isFinite(quality)||quality<(input.minimumQuality??0))return null;
  // Quaternions q and -q represent the same physical rotation; choose the
  // hemisphere closest to the previous observation to prevent sign flips.
  const previous=input.previousQuaternion;
  if(previous && [previous.x,previous.y,previous.z,previous.w].every(Number.isFinite)
      && previous.lengthSq()>1e-8 && quaternion.dot(previous)<0){
    quaternion.set(-quaternion.x,-quaternion.y,-quaternion.z,-quaternion.w);
  }
  return {position,quaternion,scale,fingerWidthPx,dorsal,axis,quality};
}
