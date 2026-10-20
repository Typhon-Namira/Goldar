import Link from "next/link";
import {API,Store,Product} from "@/lib/api";
import {notFound} from "next/navigation";
import CatalogCollection from "@/components/CatalogCollection";

export default async function Catalog({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const response=await fetch(API+"/api/public/stores/"+encodeURIComponent(slug),{cache:"no-store"});
 if(!response.ok)notFound();
 const data:{store:Store;products:Product[]}=await response.json();
 const {store,products}=data;
 const theme=store.theme==="midnight"?"dark":store.theme==="champagne"?"champagne":"";
 const lead=products.find(p=>p.cover_url);
 return <main className={"catalog luxe-catalog "+theme}>
  <div className="luxe-topline">PRIVATE DIGITAL ATELIER <span>FINE JEWELRY · REIMAGINED</span> EXPERIENCE BY GOLDAR</div>
  <header className="container catalog-header luxe-nav">
   <a href="#collection" className="luxe-nav-link">THE COLLECTION</a>
   <Link className="brandmark luxe-wordmark" href={"/s/"+store.slug}>{store.name}</Link>
   <div className="luxe-nav-actions">{store.contact_url?<a href={store.contact_url} target="_blank" rel="noopener noreferrer">CONTACT ↗</a>:<a href="#collection">DISCOVER ↗</a>}</div>
  </header>
  <section className="luxe-hero">
   <div className="luxe-hero-visual" style={store.cover_url?{backgroundImage:"linear-gradient(90deg,rgba(17,17,15,.48),rgba(17,17,15,.05)),url("+JSON.stringify(store.cover_url)+")"}:undefined}>
    {!store.cover_url&&lead?.cover_url&&<img className="luxe-hero-image" src={lead.cover_url} alt="Featured jewel"/>}
    {!store.cover_url&&!lead?.cover_url&&<div className="luxe-hero-glyph" aria-hidden="true">◇</div>}
   </div>
   <div className="luxe-hero-content container">
    <div className="luxe-hero-count"><span className="luxe-rule"/> THE ART OF ADORNMENT — EST. IN ELEGANCE</div>
    <h1 className="serif">{store.tagline||"Objects of desire."}</h1>
    <p>{store.description||"An exquisite edit of exceptional pieces. Explore every detail, every reflection, every dimension."}</p>
    <a className="luxe-hero-cta" href="#collection">DISCOVER THE COLLECTION <span>↗</span></a>
   </div>
   <div className="luxe-hero-bottom container"><span>01 / 03 — A NEW DIMENSION OF LUXURY</span><span>SCROLL TO EXPLORE ↓</span></div>
  </section>
  <section className="luxe-intro container">
   <span className="eyebrow">AN INVITATION TO DISCOVER</span>
   <h2 className="serif">Beauty, beyond <i>the ordinary.</i></h2>
   <p>Designed to be discovered from every angle. Immerse yourself in the craftsmanship of each unique piece.</p>
   <div className="luxe-flourish" aria-hidden="true">✧</div>
  </section>
  <CatalogCollection products={products} storeSlug={store.slug}/>
  <section className="luxe-editorial container"><div className="luxe-editorial-illustration">✦</div><div><span className="eyebrow">A CLOSER LOOK</span><h2 className="serif">Every detail.<br/><em>Every dimension.</em></h2><p>Rotate, zoom and discover each piece in interactive 3D. Compatible devices can also explore jewelry through augmented reality.</p><a href="#collection" className="luxe-text-link">EXPLORE THE EDIT ↗</a></div></section>
  <footer className="luxe-footer"><div className="container"><span className="brandmark">{store.name}</span><p>TIMELESS BY NATURE · PERSONAL BY DESIGN</p><div className="luxe-footer-line"><span>© {new Date().getUTCFullYear()} {store.name}</span><span>CURATED WITH GOLDAR</span></div></div></footer>
 </main>;
}
