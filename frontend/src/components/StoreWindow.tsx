"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CameraOff, Hand, Maximize, RefreshCw, RotateCw, Gem } from "lucide-react";
import type { Product, Store } from "@/lib/api";
import { nextProductIndex, windowProducts } from "@/lib/kiosk/products";
import "./store-window.css";
function JewelryIcon({ necklace }: { necklace: boolean }) {
  return necklace ? <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 10c0 23 7 29 22 34 15-5 22-11 22-34M14 12c0 18 5 24 18 29 13-5 18-11 18-29"/><path d="m32 43-6 8 6 9 6-9-6-8Z"/></svg> : <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="20" cy="12" r="3"/><circle cx="44" cy="12" r="3"/><path d="m20 17-7 18 7 16 7-16-7-18Zm24 0-7 18 7 16 7-16-7-18ZM20 23v22m24-22v22"/></svg>;
}
export default function StoreWindow({ store, products: inventory }: { store: Store; products: Product[] }) {
  const products = useMemo(() => windowProducts(inventory), [inventory]);
  const [ready, setReady] = useState(false), [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<string | null>(null), [version, setVersion] = useState(0);
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [error, setError] = useState(false), [fatal, setFatal] = useState(false);
  const [gestureError, setGestureError] = useState(false), [feedback, setFeedback] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null), rail = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(0), pendingRef = useRef<string | null>(null), readyRef = useRef(false);
  const initialProduct = useRef(products[0]?.id);
  const intentRef = useRef(0), queuedRef = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    pendingRef.current = null; setPending(null);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);
  const select = useCallback((index: number, direction = 0) => {
    if (!readyRef.current || !products[index]) return;
    intentRef.current = index;
    if (pendingRef.current) {
      queuedRef.current = index;
      setPending(products[index].id);
      setFeedback(direction);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(0), 650);
      return;
    }
    if (index === selectedRef.current) return;
    const id = products[index].id;
    pendingRef.current = id; setPending(id); setError(false); setFeedback(direction);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(0), 650);
    frame.current?.contentWindow?.postMessage({ type: "goldar-window-select", id }, location.origin);
    pendingTimer.current = setTimeout(() => { clearPending(); queuedRef.current = null; intentRef.current = selectedRef.current; setError(true); }, 30000);
  }, [products, clearPending]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "goldar-window-ready" || data.type === "goldar-window-selected") {
        const index = products.findIndex((p) => p.id === data.id);
        if (index < 0 || pendingRef.current && data.id !== pendingRef.current) return;
        selectedRef.current = index; setSelected(index); clearPending();
        if (data.type === "goldar-window-ready") { readyRef.current = true; setReady(true); }
        const queued = queuedRef.current; queuedRef.current = null;
        if (queued !== null && queued !== index) queueMicrotask(() => select(queued));
        else intentRef.current = index;
      } else if (data.type === "goldar-window-swipe" && (data.direction === -1 || data.direction === 1)) {
        select(nextProductIndex(intentRef.current, data.direction, products.length), data.direction);
      } else if (data.type === "goldar-window-model-error") {
        if (pendingRef.current && data.id !== pendingRef.current) return;
        clearPending(); setError(true);
        const queued = queuedRef.current; queuedRef.current = null;
        intentRef.current = selectedRef.current;
        if (queued !== null && products[queued]?.id !== data.id) queueMicrotask(() => select(queued));
      } else if (data.type === "goldar-window-error") {
        readyRef.current = false; setReady(false); clearPending(); queuedRef.current = null; intentRef.current = selectedRef.current; setError(true); setFatal(true);
      } else if (data.type === "goldar-window-gesture-error") setGestureError(true);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      select(nextProductIndex(intentRef.current, direction, products.length), direction);
    };
    window.addEventListener("message", message); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("message", message); window.removeEventListener("keydown", keys); };
  }, [products, select, clearPending]);
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selected]);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined, cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (cancelled) await next?.release(); else lock = next;
      } catch { /* Optional browser/OS display policy. */ }
    };
    void acquire(); document.addEventListener("visibilitychange", acquire);
    return () => { cancelled = true; void lock?.release(); document.removeEventListener("visibilitychange", acquire); };
  }, []);
  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);
  const restart = (camera = facing) => {
    initialProduct.current = products[selectedRef.current]?.id;
    queuedRef.current = null; intentRef.current = selectedRef.current;
    readyRef.current = false; setReady(false); clearPending();
    setError(false); setFatal(false); setGestureError(false); setFacing(camera);
    setVersion((v) => v + 1);
  };
  return <main className="store-window" lang="hy" dir="ltr" aria-label="Interactive jewelry mirror">
    {products.length > 0 && <iframe ref={frame} key={version}
      src={"/window-runtime/" + encodeURIComponent(store.slug) + "?camera=" + facing + "&product=" + encodeURIComponent(initialProduct.current ?? "")}
      title="Live mirror" allow="camera; fullscreen" className="window-camera" />}
    {products.length ? <>
      {!ready && !fatal && <div className="mirror-loading" role="status" aria-label="Preparing mirror"><span /></div>}
      <aside className="mirror-catalog" aria-label="Jewelry">
        <div ref={rail} className="mirror-rail">
          {products.map((p, index) => <button key={p.id} className={"mirror-product" + (pending === p.id ? " is-loading" : "")}
            aria-pressed={selected === index} aria-label={p.name} disabled={!ready || !!pending} onClick={() => select(index)}>
            <JewelryIcon necklace={p.category === "necklace"} />
            {p.cover_url && <img src={p.cover_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
          </button>)}
        </div>
      </aside>
      <nav className="mirror-tools" aria-label="Mirror controls">
        <div className={"mirror-hand" + (gestureError ? " is-unavailable" : "")} aria-label={gestureError ? "Gesture control unavailable" : "Swipe to select"}>
          <ArrowLeft className={feedback === -1 ? "is-active" : ""} size={15} /><Hand size={21} /><ArrowRight className={feedback === 1 ? "is-active" : ""} size={15} />
        </div>
        <button aria-label="Switch camera" onClick={() => restart(facing === "front" ? "back" : "front")}><RotateCw size={21} /></button>
        <button aria-label="Fullscreen" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={21} /></button>
        <button aria-label="Restart mirror" onClick={() => restart()}><RefreshCw size={21} /></button>
      </nav>
      {error && <button className={"mirror-retry" + (fatal ? " is-fatal" : "")} onClick={() => restart()} aria-label="Retry camera or model">{fatal ? <CameraOff size={32} /> : <RefreshCw size={24} />}</button>}
    </> : <div className="mirror-empty" role="status" aria-label="No published jewelry available"><Gem size={40} /></div>}
  </main>;
}
