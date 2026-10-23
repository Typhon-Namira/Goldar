"use client";
import "./ring-atelier.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Download,
  ArrowRight,
  Hand,
} from "lucide-react";
import type { Product } from "@/lib/api";
import type { Finger } from "@/lib/tryon/protocol";
import { RingSession, type SessionState } from "@/lib/tryon/session";
const endpoint = process.env.NEXT_PUBLIC_WILOR_API_URL || "";
export default function RingAtelier({ product }: { product: Product }) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<RingSession | null>(null);
  const [active, setActive] = useState(false),
    [facing, setFacing] = useState<"user" | "environment">("environment");
  const [finger, setFinger] = useState<Finger>("ring"),
    [fit, setFit] = useState(1);
  const [state, setState] = useState<SessionState>({
    phase: "searching",
    message: "A fitting, just for you.",
  });
  const [saved, setSaved] = useState<string | null>(null);
  const stop = useCallback(() => {
    session.current?.dispose();
    session.current = null;
    setActive(false);
    setSaved(null);
  }, []);
  useEffect(
    () => () => {
      session.current?.dispose();
    },
    [product.id],
  );
  useEffect(() => {
    session.current?.configure(
      finger,
      fit * (product.ring_calibration?.fitMultiplier ?? 1),
    );
  }, [finger, fit, product.ring_calibration?.fitMultiplier]);
  async function start() {
    if (!video.current || !canvas.current) return;
    stop();
    setActive(true);
    const next = new RingSession(
      video.current,
      canvas.current,
      endpoint,
      (s) => {
        if (session.current === next) setState(s);
      },
    );
    session.current = next;
    next.anchor = product.ring_calibration?.anchorFraction ?? 0.22;
    next.configure(
      finger,
      fit * (product.ring_calibration?.fitMultiplier ?? 1),
    );
    try {
      await next.start(product, facing);
    } catch (e) {
      if (session.current !== next) return;
      next.dispose();
      session.current = null;
      setActive(false);
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : "Camera unavailable.",
      });
    }
  }
  if (product.category !== "ring" || !product.glb_url)
    return (
      <div className="atelier-unavailable">
        Virtual fitting is available for rings with a 3D model.
      </div>
    );
  return (
    <section className="ring-atelier" aria-label="Virtual ring fitting">
      <div className="atelier-stage">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className={
            "atelier-capture " + (facing === "user" ? "is-mirrored" : "")
          }
          aria-hidden="true"
        />
        <canvas
          ref={canvas}
          className={
            "atelier-render " + (facing === "user" ? "is-mirrored" : "")
          }
          aria-label="Your virtual ring fitting"
        />
        <div className="atelier-topline">
          <span>
            GOLDAR <i>·</i> THE FITTING ROOM
          </span>
          <span className="atelier-live">
            <span className={active ? "is-active" : ""} />
            {active ? "CAMERA ON" : "PRIVATE SESSION"}
          </span>
        </div>
        {!active && (
          <div className="atelier-welcome">
            <div className="atelier-orbit">
              <span>G</span>
            </div>
            <p className="atelier-kicker">A NEW PERSPECTIVE</p>
            <h2>
              Made to be
              <br />
              <em>seen on you.</em>
            </h2>
            <p>
              Discover {product.name} from every angle.
              <br />
              Your camera. Your hand. Your moment.
            </p>
            <button
              className="atelier-primary"
              onClick={() => void start()}
              disabled={!endpoint}
            >
              <Camera size={17} />
              {endpoint ? "Begin your fitting" : "Fitting service unavailable"}
              <ArrowRight size={17} />
            </button>
            <small>Camera access begins only when you choose.</small>
          </div>
        )}
        {active && (
          <div className="atelier-guide" aria-hidden="true">
            <Hand size={42} strokeWidth={0.8} />
          </div>
        )}
        <div
          className={
            "atelier-feedback " + (state.phase === "error" ? "has-error" : "")
          }
          role="status"
          aria-live="polite"
        >
          <span className="atelier-indicator" />
          {active || state.phase === "error"
            ? state.message
            : "Find your light. We’ll take care of the perspective."}
        </div>
        {active && (
          <button
            className="atelier-stop"
            onClick={stop}
            aria-label="Stop camera"
          >
            <CameraOff size={18} />
          </button>
        )}
      </div>
      <div className="atelier-details">
        <div>
          <p className="atelier-kicker">YOUR SELECTION</p>
          <h3>{product.name}</h3>
          <p>
            {[product.metal, product.size_label].filter(Boolean).join(" · ") ||
              "Explore the details. Make it yours."}
          </p>
        </div>
        <div className="atelier-actions">
          <button
            onClick={() => {
              stop();
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
            aria-label="Switch camera"
          >
            <RefreshCw size={17} />{" "}
            {facing === "user" ? "Front camera" : "Rear camera"}
          </button>
          <button
            disabled={!active || state.phase !== "tracking"}
            onClick={() => {
              try {
                setSaved(session.current?.snapshot() ?? null);
              } catch {
                setState({
                  phase: "error",
                  message: "This model does not allow image export.",
                });
              }
            }}
          >
            <Download size={17} /> Capture
          </button>
          {saved && (
            <a href={saved} download="goldar-fitting.png">
              Save photo
            </a>
          )}
        </div>
      </div>
      <div className="atelier-adjust">
        <fieldset>
          <legend>Choose your finger</legend>
          <div className="atelier-fingers">
            {(["index", "middle", "ring", "pinky"] as Finger[]).map((f) => (
              <button
                key={f}
                aria-pressed={finger === f}
                onClick={() => setFinger(f)}
              >
                {f === "pinky" ? "Little" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="atelier-fit">
          Fine-tune the fit <span>{Math.round(fit * 100)}%</span>
          <input
            aria-label="Ring fit"
            type="range"
            min=".85"
            max="1.15"
            step=".01"
            value={fit}
            onChange={(e) => setFit(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="atelier-note">
        <p>
          A visual preview, not a ring-size measurement. Keep your hand relaxed
          and move slowly. Images are sent to the fitting service for
          processing.
        </p>
        {active && state.latency !== undefined && (
          <span>
            {Math.round(state.latency)} ms response ·{" "}
            {Math.round(state.inferenceMs ?? 0)} ms inference ·{" "}
            {state.cameraSource === "measured"
              ? "Calibrated camera"
              : "Estimated camera"}
          </span>
        )}
      </div>
    </section>
  );
}
