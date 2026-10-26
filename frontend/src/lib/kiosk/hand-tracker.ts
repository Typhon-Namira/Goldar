import { HandSwipeDetector } from './hand-swipe';
import type { SwipeDirection } from './swipe';
export class HandSwipeTracker {
  private worker:Worker|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private deadline:ReturnType<typeof setTimeout>|null=null;
  private disposed=false;
  private ready=false;
  private busy=false;
  private previous=-1;
  private detector=new HandSwipeDetector();
  constructor(private swipe:(direction:SwipeDirection)=>void,private failed:()=>void,private mirrored:boolean){}
  start(video:HTMLVideoElement){
    if(this.worker||this.disposed)return;
    try{
      this.worker=new Worker('/workers/hand-swipe.js');
      this.worker.onerror=()=>this.fail();
      this.worker.onmessage=({data})=>{
        if(this.disposed)return;
        if(this.deadline)clearTimeout(this.deadline);
        if(data.type==='ready')this.ready=true;
        else if(data.type==='hands'){
          this.busy=false;
          if(performance.now()-data.time<800){
            const direction=this.detector.update(data.landmarks,data.time,this.mirrored);
            if(direction)this.swipe(direction);
          }
        }else if(data.type==='error')this.fail();
      };
      this.worker.postMessage({type:'init'});
      this.deadline=setTimeout(()=>this.fail(),30000);
      this.timer=setInterval(()=>void this.capture(video),90);
    }catch{this.fail();}
  }
  private async capture(video:HTMLVideoElement){
    if(this.disposed||!this.ready||this.busy||video.readyState<2||!video.videoWidth||this.previous===video.currentTime)return;
    this.busy=true;this.previous=video.currentTime;
    const time=performance.now(),scale=Math.min(1,320/Math.max(video.videoWidth,video.videoHeight));
    let frame:ImageBitmap|undefined;
    try{
      frame=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});
      if(this.disposed){frame.close();return;}
      this.deadline=setTimeout(()=>this.fail(),10000);
      this.worker!.postMessage({type:'frame',frame,time},[frame]);
    }catch{frame?.close();if(!this.disposed)this.fail();}
  }
  private fail(){if(this.disposed)return;this.dispose();this.failed();}
  dispose(){this.disposed=true;if(this.timer)clearInterval(this.timer);if(this.deadline)clearTimeout(this.deadline);this.worker?.terminate();this.worker=null;}
}
