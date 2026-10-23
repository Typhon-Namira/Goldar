import type {RemoteHandMesh} from "@/lib/handMeshOcclusion";
import type {Joint} from "@/lib/unifiedHandTrack";
import type {HandSide} from "@/lib/handPose";

export type WiLoRHand={
 side:HandSide;landmarks:Joint[];mesh?:RemoteHandMesh;mano?:unknown
};
export type WiLoRResponse={hands?:WiLoRHand[];inferenceMs?:number};

/** One in-flight request, monotonic capture timestamps, explicit timeout.
 * The caller supplies the camera frame and owns the animation loop. */
export class WiLoRInferenceClient{
 private inFlight=false;
 private lastSent=-1;
 private abort:AbortController|null=null;
 constructor(private readonly endpoint:string){}
 get busy(){return this.inFlight}
 async infer(frame:Blob,capturedAt:number):Promise<WiLoRResponse|null>{
  if(this.inFlight||capturedAt<=this.lastSent)return null;
  this.inFlight=true;this.lastSent=capturedAt;
  const abort=new AbortController();this.abort=abort;
  const timeout=setTimeout(()=>abort.abort(),9000);
  try{
   const form=new FormData();
   form.append("frame",frame,"hand.jpg");
   form.append("include_mesh","true");
   const res=await fetch(this.endpoint+"/v1/hand-pose",{
    method:"POST",body:form,signal:abort.signal,cache:"no-store"
   });
   if(!res.ok)throw new Error("WiLoR HTTP "+res.status);
   return await res.json() as WiLoRResponse;
  }finally{
   clearTimeout(timeout);
   if(this.abort===abort)this.abort=null;
   this.inFlight=false;
  }
 }
 dispose(){this.abort?.abort()}
}
