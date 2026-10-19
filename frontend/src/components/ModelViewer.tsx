"use client";
import {useEffect,useRef,useState} from "react";
import type {HTMLAttributes} from "react";
type ViewerProps={glb:string;usdz?:string;alt?:string;ar?:boolean;poster?:string;scale?:number;className?:string};
declare module "react" {namespace JSX {interface IntrinsicElements {"model-viewer":HTMLAttributes<HTMLElement>&{"src"?:string;"ios-src"?:string;"camera-controls"?:string;"auto-rotate"?:string;"environment-image"?:string;"shadow-intensity"?:string;"exposure"?:string;"ar"?:string;"ar-modes"?:string;"poster"?:string;"interaction-prompt"?:string;"alt"?:string;ref?:React.Ref<HTMLElement>}}}}
export default function ModelViewer({glb,usdz,alt="Jewelry in 3D",ar=false,poster,className=""}:ViewerProps){
 const ref=useRef<HTMLElement>(null);const [ready,setReady]=useState(false);
 useEffect(()=>{import("@google/model-viewer").then(()=>setReady(true)).catch(()=>setReady(false))},[]);
 if(!glb)return <div className={"viewer-empty "+className}><span>◈</span><p>3D model will appear here</p></div>;
 return <div className={"viewer-wrap "+className}>
  <model-viewer ref={ref} src={glb} ios-src={usdz||undefined} alt={alt} poster={poster||undefined} camera-controls="" auto-rotate="" environment-image="neutral" shadow-intensity="0.9" exposure="1.25" interaction-prompt="auto" ar={ar?"":undefined} ar-modes="webxr scene-viewer quick-look" style={{width:"100%",height:"100%",background:"transparent",display:"block"}}/>
  <div className="viewer-caption">DRAG TO ROTATE <span>·</span> PINCH TO ZOOM</div>
  {ar&&<div className="ar-note">AR placement is available on compatible devices. Body-tracked try-on is not yet enabled.</div>}
 </div>
}
