import Link from "next/link";
import {notFound} from "next/navigation";
import {API,Store,Product} from "@/lib/api";
import ModelViewer from "@/components/ModelViewer";
import ShareButton from "@/components/ShareButton";
export default async function Detail({params}:{params:Promise<{slug:string;product:string}>}){
 const {slug,product}=await params;
 const response=await fetch(API+"/api/public/stores/"+encodeURIComponent(slug)+"/products/"+encodeURIComponent(product),{cache:"no-store"});
 if(!response.ok)notFound();
 const {store,product:p}:{store:Store;product:Product}=await response.json();
 return <main className={"catalog luxe-catalog "+(store.theme==="midnight"?"dark":store.theme==="champagne"?"champagne":"")}>
  <div className="luxe-topline">THE DIGITAL ATELIER <span>CRAFTED FOR DISCOVERY</span> EXPERIENCE BY GOLDAR</div>
  <header className="container catalog-header luxe-nav"><Link className="luxe-nav-link" href={"/s/"+store.slug}>← BACK TO COLLECTION</Link><Link className="brandmark luxe-wordmark" href={"/s/"+store.slug}>{store.name}</Link><div className="luxe-nav-actions"><span>OBJECTS OF DESIRE</span></div></header>
  <div className="container luxe-breadcrumb"><Link href={"/s/"+store.slug}>THE COLLECTION</Link><span>/</span><span>{p.category.toUpperCase()}</span><span>/</span><span>{p.name.toUpperCase()}</span></div>
  <div className="container luxe-detail-layout">
   <div className="luxe-detail-gallery">
    <div className="luxe-detail-viewer"><ModelViewer glb={p.glb_url} usdz={p.usdz_url} poster={p.cover_url} alt={p.name}/></div>
    <div className="luxe-viewer-foot"><span>01 / THE OBJECT</span><span>INTERACTIVE THREE-DIMENSIONAL VIEW ↗</span></div>
   </div>
   <div className="luxe-detail-content">
    <span className="eyebrow">EXCEPTIONAL BY DESIGN · {p.category.toUpperCase()}</span>
    <h1 className="serif">{p.name}</h1>
    <p className="luxe-detail-description">{p.description||"A rare expression of modern elegance. Crafted to be admired, explored and remembered."}</p>
    <div className="luxe-detail-facts"><div><span>MATERIAL</span><strong>{p.metal||"Upon request"}</strong></div><div><span>WEIGHT</span><strong>{p.weight_grams===null?"Upon request":p.weight_grams+" g"}</strong></div><div><span>SIZE</span><strong>{p.size_label||"Upon request"}</strong></div><div><span>PIECE REFERENCE</span><strong>{p.slug.toUpperCase()}</strong></div></div>
    <div className="luxe-detail-buttons">{p.glb_url&&p.ar_enabled&&<Link className="btn gold" href={"/ar/"+p.id}>EXPLORE IN AR ↗</Link>}{store.contact_url&&<a className="btn ghost" href={store.contact_url} rel="noopener noreferrer" target="_blank">REQUEST DETAILS ↗</a>}<ShareButton/></div>
    <p className="luxe-detail-disclaimer">3D visualization is indicative. Face fitting is available for earrings and approximate necklace previews. Native AR places the object into your surroundings.</p>
   </div>
  </div>
  <div className="luxe-detail-return container"><Link href={"/s/"+store.slug}>← RETURN TO THE COLLECTION</Link></div>
  <footer className="luxe-footer"><div className="container"><span className="brandmark">{store.name}</span><p>TIMELESS BY NATURE · PERSONAL BY DESIGN</p><div className="luxe-footer-line"><span>© {new Date().getUTCFullYear()} {store.name}</span><span>CURATED WITH GOLDAR</span></div></div></footer>
 </main>;
}
