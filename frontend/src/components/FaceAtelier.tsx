"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import type { Product } from "@/lib/api";
import "./face-atelier.css";
export default function FaceAtelier({ product }: { product: Product }) {
  const [running, setRunning] = useState(false),
    [facing, setFacing] = useState<"front" | "back">("front");
  const [version, setVersion] = useState(0),
    [fit, setFit] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "goldar-face-ready"
      ) {
        frame.current?.contentWindow?.postMessage(
          { type: "goldar-face-fit", value: fit },
          location.origin,
        );
      }
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [fit]);
  function updateFit(value: number) {
    setFit(value);
    frame.current?.contentWindow?.postMessage(
      { type: "goldar-face-fit", value },
      location.origin,
    );
  }
  const necklace = product.category === "necklace";
  return (
    <section className="face-atelier" aria-label="Face jewelry fitting">
      <div className="atelier-stage">
        {running ? (
          <iframe
            key={version}
            ref={frame}
            src={
              "/face-runtime/" +
              encodeURIComponent(product.id) +
              "?camera=" +
              facing
            }
            title="Live jewelry fitting"
            allow="camera"
            onLoad={() => updateFit(fit)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
          />
        ) : (
          <div className="atelier-welcome">
            <div className="atelier-orbit">
              <span>G</span>
            </div>
            <p className="atelier-kicker">THE FACE ATELIER</p>
            <h2>
              Your jewelry.
              <br />
              <em>Your reflection.</em>
            </h2>
            <p>
              Discover {product.name} on you.
              <br />
              {necklace
                ? "A face-guided necklace preview."
                : "Reveal your ears and explore every angle."}
            </p>
            <button
              className="atelier-primary"
              onClick={() => {
                setVersion((v) => v + 1);
                setRunning(true);
              }}
            >
              <Camera size={18} />
              Begin your fitting
            </button>
            <small>
              Face tracking runs on your device. Camera images are not uploaded.
            </small>
          </div>
        )}
      </div>
      <div className="atelier-details">
        <div>
          <p className="atelier-kicker">
            {necklace ? "NECKLACE PREVIEW" : "EARRING FITTING"}
          </p>
          <h3>{product.name}</h3>
          <p>{product.metal}</p>
        </div>
        <div className="atelier-actions">
          {running && (
            <button onClick={() => setRunning(false)}>
              <CameraOff size={18} />
              Stop camera
            </button>
          )}
          <button
            onClick={() => {
              setRunning(false);
              setFacing((v) => (v === "front" ? "back" : "front"));
            }}
          >
            <RefreshCw size={16} />
            {facing === "front" ? "Front camera" : "Rear camera"}
          </button>
        </div>
      </div>
      <div className="atelier-adjust">
        <label className="atelier-fit">
          Preview scale <span>{Math.round(fit * 100)}%</span>
          <input
            type="range"
            min=".7"
            max="1.3"
            step=".01"
            value={fit}
            onChange={(e) => updateFit(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="atelier-note">
        <p>
          {necklace
            ? "Approximate necklace placement is guided by your chin and follows head motion. It does not track your shoulders or measure neck size."
            : "Use a model of one earring. Earrings attach only to detected earlobes and hide when tracking is lost. Earlobe depth is approximate; hair is not masked. Preview size is approximate."}
        </p>
        <p>
          Powered by{" "}
          <a
            href="https://github.com/8thwall/8thwall"
            target="_blank"
            rel="noreferrer"
          >
            8th Wall open-source Face Effects
          </a>{" "}
          ·{" "}
          <a href="/vendor/8thwall/LICENSE.txt" target="_blank">
            MIT license
          </a>
        </p>
      </div>
    </section>
  );
}
