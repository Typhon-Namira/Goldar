"use client";
import {useEffect,useRef,useState} from "react";
import type {HTMLAttributes} from "react";
type Props={glb:string;usdz?:string;alt?:string;ar?:boolean;poster?:string;scale?:number;className?:string};
type ViewerElement=HTMLElement & {modelIsVisible?:boolean;canActivateAR?:boolean;activateAR?:()=>Promise<void>};
declare module "react"{namespace JSX{interface IntrinsicElements{"model-viewer":HTMLAttributes<HTMLElement>&{src?:string;"ios-src"?:string;"camera-controls"?:string;"auto-rotate"?:string;"environment-image"?:string;"shadow-intensity"?:string;exposure?:string;ar?:string;"ar-modes"?:string;poster?:string;"interaction-prompt"?:string;alt?:string;ref?:React.Ref<HTMLElement>}}}}
export default function ModelViewer({glb,usdz,alt="Jewelry",ar=false,poster,className=""}:Props){
 const ref=useRef<ViewerElement>(null);
 const [registered,setRegistered]=useState(false);
 const [state,setState]=useState<"loading"|"ready"|"error">("loading");
 const [reason,setReason]=useState("");
 useEffect(()=>{
  let live=true;
  import("@google/model-viewer").then(()=>{if(live)setRegistered(true)}).catch(e=>{if(live){setState("error");setReason("3D viewer library failed to initialize: "+String(e))}});
  return()=>{live=false};
 },[]);
 useEffect(()=>{setState("loading");setReason("")},[glb]);
 useEffect(()=>{
  const el=ref.current;if(!registered||!el||!glb)return;
  const onLoad=()=>{setState("ready");setReason("")};
  const onError=(event:Event)=>{
   const detail=(event as CustomEvent<{type?:string;message?:string}>).detail;
   const type=detail?.type||"unknown-error";
   setState("error");
   setReason("3D viewer failed ("+type+"). "+(detail?.message||"The GLB could be invalid, unsupported, or contain inaccessible dependent assets. Check the browser Console for details."));
  };
  el.addEventListener("load",onLoad);el.addEventListener("error",onError);
  if(el.modelIsVisible)onLoad();
  return()=>{el.removeEventListener("load",onLoad);el.removeEventListener("error",onError)};
 },[registered,glb]);
 if(!glb)return <div className={"viewer-empty "+className}><span>◇</span><p>3D model not attached</p><small>Provide a public HTTPS GLB URL in the product editor.</small></div>;
 return <div className={"viewer-wrap "+className}>
  {registered&&<model-viewer ref={ref} src={glb} ios-src={usdz||undefined} poster={poster||undefined} alt={alt} camera-controls="" auto-rotate="" environment-image="neutral" shadow-intensity="0.8" exposure="1.2" interaction-prompt="auto" ar={ar?"":undefined} ar-modes="webxr scene-viewer quick-look" style={{display:"block",width:"100%",height:"100%",background:"transparent"}}/>}
  {state==="loading"&&<div className="viewer-state" role="status">LOADING 3D JEWELRY…</div>}
  {state==="error"&&<div className="viewer-error" role="alert"><p>{reason}</p><a href={glb} target="_blank" rel="noopener noreferrer">Open model URL ↗</a></div>}
  {state==="ready"&&<div className="viewer-caption">DRAG TO ROTATE · PINCH TO ZOOM</div>}
  {ar&&<p className="ar-note">Native scene AR places the model in your environment. Live body try-on is a separate feature.</p>}
 </div>;
}
