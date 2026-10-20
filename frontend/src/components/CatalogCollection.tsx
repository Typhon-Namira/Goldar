"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import type {Product} from "@/lib/api";

const categories=[["all","All pieces"],["ring","Rings"],["bracelet","Bracelets"],["necklace","Necklaces"],["earring","Earrings"]];
export default function CatalogCollection({products,storeSlug}:{products:Product[];storeSlug:string}){
 const [active,setActive]=useState("all");
 const visible=useMemo(()=>products.filter(p=>active==="all"||p.category===active),[products,active]);
 return <section id="collection" className="luxe-collection container">
 <div className="luxe-section-heading"><div><span className="eyebrow">THE SIGNATURE EDIT</span><h2 className="serif">The Collection<span className="luxe-dot">.</span></h2></div><p>Thoughtfully selected. Beautifully presented.<br/>Discover the extraordinary in every piece.</p></div>
 <div className="luxe-filters" role="group" aria-label="Filter by jewelry category">
 {categories.filter(([id])=>id==="all"||products.some(p=>p.category===id)).map(([id,label])=><button key={id} className={active===id?"selected":""} aria-pressed={active===id} onClick={()=>setActive(id)}>{label}</button>)}
 <span className="luxe-count">{visible.length} PIECES</span></div>
 <div className="luxe-product-grid">
 {visible.map((p,i)=><Link href={"/s/"+encodeURIComponent(storeSlug)+"/p/"+encodeURIComponent(p.slug)} className="luxe-product-card" key={p.id}>
 <div className="luxe-product-media">{p.cover_url?<img src={p.cover_url} alt={p.name} loading="lazy"/>:<span className="luxe-product-placeholder" aria-hidden="true">◇</span>}<span className="luxe-product-index">{String(i+1).padStart(2,"0")} / {String(visible.length).padStart(2,"0")}</span><span className="luxe-product-arrow">↗</span></div>
 <div className="luxe-product-info"><div><span className="luxe-product-category">{p.category.toUpperCase()} {p.metal?"— "+p.metal.toUpperCase():""}</span><h3 className="serif">{p.name}</h3></div><span className="luxe-product-explore">DISCOVER ↗</span></div></Link>)}
 </div>
 {!visible.length&&<p className="luxe-empty">No pieces in this collection yet.</p>}
 </section>;
}
