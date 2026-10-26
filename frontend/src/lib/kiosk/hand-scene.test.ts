import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {it,expect} from 'vitest';
function guard(){
 const context={self:{} as {createHandSceneGuard?:()=>((pixels:Uint8ClampedArray)=>boolean)}};
 runInNewContext(readFileSync(new URL('../../../public/workers/hand-scene.js',import.meta.url),'utf8'),context);
 return context.self.createHandSceneGuard!();
}
it('resets motion on an abrupt whole-camera scene change but not an ordinary local hand movement',()=>{
 const next=guard(),image=new Uint8ClampedArray(32*24*4).fill(40);
 expect(next(image)).toBe(false);
 const hand=new Uint8ClampedArray(image);hand.fill(200,0,Math.floor(hand.length*.3));
 expect(next(hand)).toBe(false);
 expect(next(new Uint8ClampedArray(image))).toBe(false);
 expect(next(new Uint8ClampedArray(image.length).fill(230))).toBe(true);
 expect(next(new Uint8ClampedArray(image.length).fill(230))).toBe(false);
});
