import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {HandSwipeTracker} from './hand-tracker';
class WorkerStub{
 static current:WorkerStub;
 onmessage:((e:{data:Record<string,unknown>})=>void)|null=null;
 onerror:(()=>void)|null=null;
 postMessage=vi.fn();terminate=vi.fn();
 constructor(public url:string){WorkerStub.current=this;}
 send(data:Record<string,unknown>){this.onmessage?.({data});}
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','performance']});vi.stubGlobal('Worker',WorkerStub);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const video=()=>({readyState:4,videoWidth:640,videoHeight:480,currentTime:1}) as HTMLVideoElement;
it('turns independent hand-worker results into a swipe on the existing video without body landmarks',async()=>{
 vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({close:vi.fn()}));
 const swipe=vi.fn(),failed=vi.fn(),v=video(),tracker=new HandSwipeTracker(swipe,failed,false);
 tracker.start(v);const worker=WorkerStub.current;
 expect(worker.url).toBe('/workers/hand-swipe.js');worker.send({type:'ready'});
 for(let i=0;i<3;i++){
  await vi.advanceTimersByTimeAsync(90);
  const frame=worker.postMessage.mock.calls.at(-1)![0];
  worker.send({type:'hands',time:frame.time,landmarks:[Array.from({length:21},()=>({x:.3+i*.05,y:.4}))]});
  v.currentTime++;
 }
 expect(swipe).toHaveBeenCalledTimes(1);expect(swipe).toHaveBeenCalledWith(1);expect(failed).not.toHaveBeenCalled();
 tracker.dispose();await vi.advanceTimersByTimeAsync(30000);expect(worker.terminate).toHaveBeenCalledTimes(1);expect(failed).not.toHaveBeenCalled();
});
it('releases a late bitmap when the mirror closes during capture',async()=>{
 let finish!:(v:unknown)=>void;const bitmap={close:vi.fn()},failed=vi.fn();
 vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
 const tracker=new HandSwipeTracker(vi.fn(),failed,true);tracker.start(video());WorkerStub.current.send({type:'ready'});
 await vi.advanceTimersByTimeAsync(90);tracker.dispose();finish(bitmap);await vi.advanceTimersByTimeAsync(0);
 expect(bitmap.close).toHaveBeenCalledTimes(1);expect(WorkerStub.current.postMessage).toHaveBeenCalledTimes(1);expect(failed).not.toHaveBeenCalled();
});
it('reports initialization failure only once and ignores late results after disposal',()=>{
 const failed=vi.fn(),swipe=vi.fn(),tracker=new HandSwipeTracker(swipe,failed,true);
 tracker.start(video());WorkerStub.current.send({type:'error'});WorkerStub.current.onerror?.();WorkerStub.current.send({type:'hands',landmarks:[],time:0});
 expect(failed).toHaveBeenCalledTimes(1);expect(swipe).not.toHaveBeenCalled();
});
