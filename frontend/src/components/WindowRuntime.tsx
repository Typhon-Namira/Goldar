"use client";
import { useEffect, useRef } from "react";
import { FaceEngine } from "@/lib/face/engine";
import type { Product } from "@/lib/api";
export default function WindowRuntime({ products, initialId, facing }: {
  products: Product[]; initialId?: string; facing: "front" | "back";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !products.length) return;
    let active = true, current = products.find((p) => p.id === initialId) ?? products[0];
    const send = (data: Record<string, unknown>) => {
      if (active) parent.postMessage(data, location.origin);
    };
    const engine = new FaceEngine(canvas.current, current,
      (message) => send({ type: "goldar-window-status", message }), {
        autoFrame:true,
        onSwipe: (direction) => send({ type: "goldar-window-swipe", direction }),
        onGestureError: () => send({ type: "goldar-window-gesture-error" }),
        onFatalError: (message) => send({ type: "goldar-window-error", message }),
        onModelError: (id) => send({ type: "goldar-window-model-error", id }),
      });
    const select = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent ||
          event.data?.type !== "goldar-window-select") return;
      const product = products.find((p) => p.id === event.data.id);
      if (!product) return;
      try {
        if (product.id !== current.id && !(await engine.setProduct(product))) return;
        current = product;
        send({ type: "goldar-window-selected", id: product.id });
      } catch {
        send({ type: "goldar-window-model-error", id: product.id });
      }
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        send({ type: "goldar-window-swipe", direction: event.key === "ArrowDown" ? 1 : -1 });
      }
    };
    window.addEventListener("message", select);
    window.addEventListener("keydown", keys);
    void engine.start(facing).then(() => {
      send({ type: "goldar-window-ready", id: current.id });
    }).catch(() => {
      engine.dispose();
      send({ type: "goldar-window-error" });
    });
    return () => {
      active = false;
      window.removeEventListener("message", select);
      window.removeEventListener("keydown", keys);
      engine.dispose();
    };
  }, [products, initialId, facing]);
  return <main lang="hy" style={{ position: "fixed", inset: 0, overflow:"hidden",background:"#10130f" }}><canvas ref={canvas} aria-label="Live jewelry mirror" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", willChange:"transform", background: "#10130f" }} /></main>;
}
