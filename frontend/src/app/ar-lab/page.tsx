import Link from "next/link";

export default function ARLab(){
 const demo="https://webar.rocks/demos/hand/demos/VTO/";
 return <main style={{minHeight:"100vh",background:"#111514",color:"#f4ede1",padding:"clamp(24px,5vw,72px)"}}>
   <div style={{maxWidth:900,margin:"auto"}}>
     <p style={{letterSpacing:4,fontSize:12}}>GOLDAR / EXPERIMENTAL AR LAB</p>
     <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(36px,6vw,70px)",fontWeight:400}}>Ring engine comparison.</h1>
     <p style={{lineHeight:1.8,maxWidth:620}}>Compare the existing Goldar fitting engine with the open-source WebAR.rocks ring-and-wrist demonstration. The external demo runs independently and does not yet load Goldar product models. This lab is not a production try-on replacement.</p>
     <div style={{display:"flex",flexWrap:"wrap",gap:16,margin:"30px 0"}}>
       <a href={demo} target="_blank" rel="noopener noreferrer" style={{padding:"15px 23px",background:"#cfab6a",color:"#111",textDecoration:"none",borderRadius:4}}>OPEN WEBAR.ROCKS RING DEMO ↗</a>
       <Link href="/admin" style={{padding:"15px 23px",border:"1px solid #b89d6f",color:"#e6d4b1",textDecoration:"none",borderRadius:4}}>GOLDAR ADMIN ↗</Link>
     </div>
     <h2 style={{fontFamily:"Georgia,serif",fontWeight:400}}>What to compare on the same device</h2>
     <ol style={{lineHeight:2.1}}>
       <li>Ring position on the base of the finger, palm facing camera</li>
       <li>Band occlusion when rotating the hand 45° and 90°</li>
       <li>Tracking jitter with a stationary hand for 20 seconds</li>
       <li>Model disappearance or flipping during slow finger movement</li>
       <li>Camera initialization and sustained frame rate</li>
     </ol>
     <p style={{opacity:.7}}>License: WebAR.rocks.hand is MIT-licensed. Third-party demonstration remains on its own domain; no camera frames are sent through Goldar by this evaluation page.</p>
   </div>
 </main>
}
