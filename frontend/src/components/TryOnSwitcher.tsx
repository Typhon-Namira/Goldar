"use client";
import {useMemo,useState} from "react";
import type {Product} from "@/lib/api";
import HandTryOn from "@/components/HandTryOn";
import WiLoRTryOn from "@/components/WiLoRTryOn";
import WiLoRTrue3DTryOn from "@/components/WiLoRTrue3DTryOn";
type Engine="webar"|"legacy"|"wilor"|"true3d";
export default function TryOnSwitcher({product}:{product:Product}){
 const [engine,setEngine]=useState<Engine>("true3d");
 const [running,setRunning]=useState(false);
 const [version,setVersion]=useState(0);
 const [scale,setScale]=useState(.421);
 const [x,setX]=useState(-1.66),[y,setY]=useState(-11.91),[z,setZ]=useState(.26);
 const url=useMemo(()=>{
  const q=new URLSearchParams({glb:product.glb_url,scale:String(scale),x:String(x),y:String(y),z:String(z)});
  return "/webar-rocks/runner.html?"+q.toString();
 },[product.glb_url,scale,x,y,z]);
 function switchEngine(next:Engine){setRunning(false);setEngine(next);setVersion(v=>v+1)}
 return <section className="tryon-panel">
  <div className="tryon-controls" style={{paddingBottom:16}}>
   <div className="tryon-controlrow">
    <button type="button" className={"btn "+(engine==="webar"?"gold":"ghost")} onClick={()=>switchEngine("webar")}>WEBAR.ROCKS — EXPERIMENTAL</button>
    <button type="button" className={"btn "+(engine==="legacy"?"gold":"ghost")} onClick={()=>switchEngine("legacy")}>MEDIAPIPE — OLD</button>
    <button type="button" className={"btn "+(engine==="wilor"?"gold":"ghost")} onClick={()=>switchEngine("wilor")}>HYBRID — LEGACY</button>
    <button type="button" className={"btn "+(engine==="true3d"?"gold":"ghost")} onClick={()=>switchEngine("true3d")}>TRUE 3D — WiLoR MANO</button>
   </div>
   <p className="tryon-disclaimer">True 3D uses a calibrated perspective camera and one metric depth buffer for the hand mesh and ring. WebAR.rocks runs separately as a fallback because its isolated camera tracker cannot share pose data directly.</p>
  </div>
  {engine==="legacy"?<HandTryOn key={"old-"+version} product={product}/>:engine==="wilor"?<WiLoRTryOn key={"wilor-"+version} product={product}/>:engine==="true3d"?<WiLoRTrue3DTryOn key={"true3d-"+version} product={product}/>:<>
   {!running?<div className="tryon-viewport" style={{minHeight:400,display:"grid",placeItems:"center",padding:22,textAlign:"center"}}>
     <div><h3>Goldar Ring Engine V4</h3><p>Test the WebAR.rocks ring tracker with this product.</p>
     <button type="button" className="btn gold" onClick={()=>setRunning(true)}>START WEBAR TRY-ON →</button></div>
   </div>:<div className="tryon-viewport" style={{minHeight:480,aspectRatio:"3 / 4"}}>
     <iframe key={version} src={url} title="WebAR.rocks virtual ring fitting" allow="camera" style={{border:0,width:"100%",height:"100%",minHeight:480,display:"block"}} />
   </div>}
   <div className="tryon-controls">
    <div className="tryon-controlrow">
     <button className="btn ghost" type="button" onClick={()=>{setRunning(false);setVersion(v=>v+1)}}>STOP CAMERA</button>
     <button className="btn ghost" type="button" onClick={()=>setVersion(v=>v+1)} disabled={!running}>RESTART WITH CALIBRATION</button>
    </div>
    <label className="tryon-setting">Model scale <input type="range" min=".05" max="5" step=".05" value={scale} onChange={e=>setScale(Number(e.target.value))}/><strong>{scale.toFixed(1)}</strong></label>
    {([["X",x,setX],["Y",y,setY],["Z",z,setZ]] as const).map(([label,val,set])=><label key={label} className="tryon-setting">Offset {label}<input type="range" min="-20" max="20" step=".1" value={val} onChange={e=>set(Number(e.target.value))}/><strong>{val.toFixed(1)}</strong></label>)}
    <p className="tryon-hint">Adjust sliders, then press RESTART WITH CALIBRATION. Reset to the old engine using the selector above. Android Chrome and iPhone Safari must be validated separately.</p>
   </div>
  </>}
 </section>;
}
