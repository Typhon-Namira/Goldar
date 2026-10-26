"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Gem, Maximize, Power, RefreshCw, Sparkles } from "lucide-react";
import type { Product, Store } from "@/lib/api";
import { nextProductIndex, windowProducts } from "@/lib/kiosk/products";
import "./store-window.css";
export default function StoreWindow({ store, products: inventory }: { store: Store; products: Product[] }) {
  const products = useMemo(() => windowProducts(inventory), [inventory]);
  const [running, setRunning] = useState(false), [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(0), [pending, setPending] = useState<string | null>(null);
  const [version, setVersion] = useState(0), [facing, setFacing] = useState<"front" | "back">("front");
  const [error, setError] = useState(""), [gestureError, setGestureError] = useState(false);
  const [tracking, setTracking] = useState(false), [feedback, setFeedback] = useState<-1 | 0 | 1>(0);
  const frame = useRef<HTMLIFrameElement>(null), rail = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(0), pendingRef = useRef<string | null>(null), readyRef = useRef(false);
  const initialProduct = useRef(products[0]?.id);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    pendingRef.current = null; setPending(null);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);
  const select = useCallback((index: number, direction: -1 | 0 | 1 = 0) => {
    if (!readyRef.current || pendingRef.current || !products[index] || index === selectedRef.current) return;
    const id = products[index].id;
    pendingRef.current = id; setPending(id); setError("");
    setFeedback(direction);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(0), 650);
    frame.current?.contentWindow?.postMessage({ type: "goldar-window-select", id }, location.origin);
    // Preserve selection if a model request fails or the runtime stops replying.
    pendingTimer.current = setTimeout(() => {
      clearPending(); setError("دریافت مدل طول کشید. دوباره انتخاب کنید.");
    }, 30000);
  }, [products, clearPending]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "goldar-window-ready" || data.type === "goldar-window-selected") {
        const index = products.findIndex((p) => p.id === data.id);
        if (index < 0 || (pendingRef.current && data.id !== pendingRef.current)) return;
        selectedRef.current = index; setSelected(index); clearPending();
        if (data.type === "goldar-window-ready") { readyRef.current = true; setReady(true); }
      } else if (data.type === "goldar-window-swipe" && (data.direction === -1 || data.direction === 1)) {
        select(nextProductIndex(selectedRef.current, data.direction, products.length), data.direction);
      } else if (data.type === "goldar-window-status") {
        setTracking(typeof data.message === "string" && data.message.includes("preview ·"));
      } else if (data.type === "goldar-window-model-error") {
        if (pendingRef.current && data.id !== pendingRef.current) return;
        clearPending(); setError("این مدل بارگیری نشد. محصول دیگری را انتخاب کنید.");
      } else if (data.type === "goldar-window-error") {
        readyRef.current = false; setReady(false); clearPending();
        setError("دوربین یا مدل شروع نشد. اتصال وبکم و اجازهٔ دوربین مرورگر را بررسی و نمایش را دوباره شروع کنید.");
      } else if (data.type === "goldar-window-gesture-error") setGestureError(true);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      select(nextProductIndex(selectedRef.current, direction, products.length), direction);
    };
    window.addEventListener("message", message); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("message", message); window.removeEventListener("keydown", keys); };
  }, [products, select, clearPending]);
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selected, running]);
  useEffect(() => {
    if (!running) return;
    let lock: WakeLockSentinel | undefined, cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (cancelled) await next?.release(); else lock = next;
      } catch { /* Display power policy may be managed by the operator. */ }
    };
    void acquire(); document.addEventListener("visibilitychange", acquire);
    return () => { cancelled = true; void lock?.release(); document.removeEventListener("visibilitychange", acquire); };
  }, [running]);
  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);
  const start = () => {
    initialProduct.current = products[selectedRef.current]?.id;
    readyRef.current = false; setReady(false); clearPending();
    setError(""); setGestureError(false); setTracking(false);
    setVersion((v) => v + 1); setRunning(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const stop = () => {
    setRunning(false); readyRef.current = false; setReady(false); clearPending();
  };
  const product = products[selected];
  return <main className="store-window" lang="fa" dir="rtl">
    {running && <iframe ref={frame} key={version}
      src={"/window-runtime/" + encodeURIComponent(store.slug) + "?camera=" + facing + "&product=" + encodeURIComponent(initialProduct.current ?? "")}
      title="دوربین ویترین تعاملی" allow="camera" className="window-camera" />}
    <div className="window-shade" />
    <header className="window-header">
      <div className="window-brand">{store.logo_url && <img src={store.logo_url} alt="" />}<div><span>ویترین تعاملی</span><h1>{store.name}</h1></div></div>
      {running && <div className="window-live"><i /> {ready ? "آینهٔ زنده" : "در حال آماده‌سازی"}</div>}
    </header>
    {!running ? <section className="window-setup">
      <div className="window-emblem"><Gem size={42} strokeWidth={1} /></div>
      <p className="window-eyebrow">زیورآلات، در تصویر شما</p>
      <h2>ببینید چقدر<br /><em>به شما می‌آید.</em></h2>
      <p>مقابل دوربین بایستید؛ با حرکت دست به چپ و راست،<br />گوشواره‌ها و گردنبندها را روی خودتان امتحان کنید.</p>
      {products.length ? <>
        <button className="window-start" onClick={start}><Camera size={22} /> شروع نمایش ویترین</button>
        <button className="window-camera-choice" onClick={() => setFacing((v) => v === "front" ? "back" : "front")}><RefreshCw size={16} /> {facing === "front" ? "وبکم / دوربین جلو" : "دوربین پشت"}</button>
        <small>برای مسئول فروشگاه: وبکم را وصل و اجازهٔ دوربین را تأیید کنید.<br />تصاویر دوربین روی همین دستگاه پردازش می‌شوند و ارسال نمی‌شوند.</small>
      </> : <p role="status" className="window-empty">هنوز مدل آمادهٔ نمایش وجود ندارد.<br />مدل گوشواره یا گردنبند را از داشبورد اضافه و نمایش مجازی آن را فعال کنید.</p>}
    </section> : <>
      {!tracking && <section className="window-instruction" aria-live="polite">
        <span className="window-eyebrow">{tracking ? "انتخاب شما، روی شما" : "مقابل دوربین بایستید"}</span>
        <h2>{products.length > 1 ? "با حرکت دست، انتخاب کنید" : "زیور دلخواهتان را امتحان کنید"}</h2>
        <p>{gestureError ? "کنترل حرکتی آماده نشد؛ مسئول فروشگاه نمایش را دوباره شروع کند." : product?.category === "necklace" ? "گردن و هر دو شانه در تصویر باشند" : "صورت و لاله‌های گوش در تصویر باشند"}</p>
      </section>}
      <div className="window-swipe-cue" aria-hidden="true"><ArrowLeft className={feedback === -1 ? "swipe-active" : ""} /><span>{gestureError ? "کنترل حرکتی آماده نیست؛ نمایش را دوباره شروع کنید" : products.length > 1 ? "دست خود را به چپ یا راست حرکت دهید" : "بدون لمس، روی خودتان امتحان کنید"}</span><ArrowRight className={feedback === 1 ? "swipe-active" : ""} /></div>
      {error && <div className="window-error" role="alert">{error}<button onClick={start}>شروع مجدد</button></div>}
      <section className="window-collection" aria-label="محصولات فروشگاه">
        <div className="window-selection"><div><span>{product?.category === "necklace" ? "گردنبند" : "گوشواره"}</span><h3>{product?.name}</h3></div><p>{String(selected + 1).padStart(2, "0")} <span>/ {String(products.length).padStart(2, "0")}</span></p></div>
        <div ref={rail} className="window-product-rail" dir="ltr">
          {products.map((p, index) => <button key={p.id} className={"window-product" + (pending === p.id ? " is-loading" : "")}
            aria-pressed={selected === index} aria-label={p.name} disabled={!ready || !!pending} onClick={() => select(index)}>
            <div className="window-product-image">{p.cover_url ? <img src={p.cover_url} alt="" /> : p.category === "necklace" ? <Gem size={34} strokeWidth={1} /> : <Sparkles size={34} strokeWidth={1} />}</div>
            <div dir="auto"><strong>{p.name}</strong><span>{pending === p.id ? "در حال بارگیری…" : p.metal || (p.category === "necklace" ? "گردنبند" : "گوشواره")}</span></div>
          </button>)}
        </div>
      </section>
    </>}
    <footer className="window-footer"><span>GOLDAR <i>INTERACTIVE WINDOW</i></span>{running && <div><button aria-label="تمام‌صفحه" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={18} /></button><button aria-label="توقف نمایش" onClick={stop}><Power size={18} /></button></div>}</footer>
  </main>;
}
