"use client";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/api";
import { FaceEngine } from "@/lib/face/engine";
export default function FaceRuntime({
  product,
  facing,
}: {
  product: Product;
  facing: "front" | "back";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Preparing your fitting room…");
  useEffect(() => {
    if (!canvas.current) return;
    let active = true;
    const engine = new FaceEngine(canvas.current, product, (message) => {
      if (active) setStatus(message);
    });
    const fit = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.source === parent &&
        event.data?.type === "goldar-face-fit" &&
        Number.isFinite(event.data.value)
      )
        engine.setFit(event.data.value);
    };
    window.addEventListener("message", fit);
    parent.postMessage({ type: "goldar-face-ready" }, location.origin);
    void engine.start(facing).catch((error) => {
      if (active) {
        engine.dispose();
        setStatus(
          error instanceof Error
            ? error.message
            : "Camera unavailable. Stop and retry.",
        );
      }
    });
    return () => {
      active = false;
      window.removeEventListener("message", fit);
      engine.dispose();
    };
  }, [product, facing]);
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#20251f",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvas}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          inset: 0,
        }}
        aria-label="Live face jewelry preview"
      />
      <p
        role="status"
        style={{
          position: "absolute",
          bottom: 10,
          left: 16,
          right: 16,
          padding: "12px 16px",
          background: "#172219b8",
          fontSize: 12,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {status}
      </p>
    </main>
  );
}
