"use client";
import {useEffect,useRef,useState} from "react";
import type {HTMLAttributes} from "react";
type Props={glb:string;usdz?:string;alt?:string;ar?:boolean;poster?:string;scale?:number;className?:string};
declare module "react"{namespace JSX{interface IntrinsicElements{"model-viewer":HTMLAttributes<HTMLElement>&{src?:string;"ios-src"?:string;"camera-controls"?:string;"auto-rotate"?:string;"environment-image"?:string;"shadow-intensity"?:string;exposure?:string;ar?:string;"ar-modes"?:string;poster?:string;"interaction-prompt"?:string;alt?:string;ref?:React.Ref<HTMLElement>}}}}
export default function ModelViewer({glb,usdz,alt="Jewelry",ar=false,poster,className=""}:Props){
 const view=useRef<HTMLElement>(null);const [state,setState]=useState<"loading"|"ready"|"error">("loading");const [why,setWhy]=useState("");
 useEffect(()=>{setState(glb?"loading":"error");setWhy(glb?"":"No GLB model URL has been assigned to this product.");if(!glb)return;
 let active=true;import("@google/model-viewer").catch(()=>{if(active){setWhy("3D renderer could not be loaded.");setState("error")}});return()=>{active=false}},[glb]);
 useEffect(()=>{if(!glb)return;let cancelled=false;const controller=new AbortController();async function check(){try{const response=await fetch(glb,{method:"GET",mode:"cors",signal:controller.signal});if(!response.ok)throw new Error("CDN returned HTTP "+response.status);const type=response.headers.get("content-type")||"";const buffer=await response.arrayBuffer();if(cancelled)return;const bytes=new Uint8Array(buffer);const magic=bytes.length>=4?String.fromCharCode(...bytes.slice(0,4)):"";if(magic!=="glTF"){setState("error");setWhy("The URL did not return GLB binary data (glTF signature missing). Check CDN file path, response and file format.");return}if(bytes.length<20){setState("error");setWhy("GLB file is truncated or empty.");return}const data=new DataView(buffer);const declared=data.getUint32(8,true);if(declared!==buffer.byteLength){setState("error");setWhy("GLB file length does not match its header. File may be corrupted.");return} }catch(e){if(cancelled)return;setState("error");setWhy("CDN request failed: "+(e instanceof Error?e.message:"Network error")+". Verify URL accessibility and Access-Control-Allow-Origin.");}}check();return()=>{cancelled=true;controller.abort()};},[glb]);
 useEffect(()=>{const el=view.current;if(!el||!glb)return;const loaded=()=>{setState("ready");setWhy("")};const failed=(e:Event)=>{setState("error");setWhy("The 3D file could not be loaded. Verify that the GLB URL returns a public model/gltf-binary file, with appropriate CORS settings.")};el.addEventListener("load",loaded);el.addEventListener("error",failed);return()=>{el.removeEventListener("load",loaded);el.removeEventListener("error",failed)}},[glb]);
 if(!glb)return <div className={"viewer-empty "+className}><span>◇</span><p>3D model not attached</p><small>Upload a GLB file or provide its public HTTPS URL in the product editor.</small></div>;
 return <div className={"viewer-wrap "+className}>
  <model-viewer ref={view} src={glb} ios-src={usdz||undefined} poster={poster||undefined} alt={alt} camera-controls="" auto-rotate="" environment-image="neutral" shadow-intensity="0.9" exposure="1.25" interaction-prompt="auto" ar={ar?"":undefined} ar-modes="webxr scene-viewer quick-look" style={{display:"block",width:"100%",height:"100%"}}/>
  {state==="loading"&&<div className="viewer-state" role="status">LOADING 3D JEWELRY…</div>}
  {state==="error"&&<div className="viewer-error" role="alert"><p>{why}</p><a href={glb} target="_blank" rel="noopener noreferrer">Inspect 3D asset ↗</a></div>}
  {state==="ready"&&<div className="viewer-caption">DRAG TO ROTATE · PINCH TO ZOOM</div>}
  {ar&&<p className="ar-note">Native scene AR is different from body tracking. Use the fitting room for supported hand try-on.</p>}
 </div>;
}
