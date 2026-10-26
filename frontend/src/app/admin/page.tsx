"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  request,
  Store,
  Product,
  FaceCalibrationConfig,
  slugify,
  API,
} from "@/lib/api";
import { defaultCalibration, resolveCalibration } from "@/lib/face/config";
import { QRCodeSVG } from "qrcode.react";
const emptyStore = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  logo_url: "",
  cover_url: "",
  theme: "ivory",
  contact_url: "",
  published: true,
};
const emptyProduct = {
  name: "",
  slug: "",
  description: "",
  category: "earring",
  metal: "",
  weight_grams: null as number | null,
  size_label: "",
  cover_url: "",
  glb_url: "",
  usdz_url: "",
  scale: 1,
  ar_enabled: true,
  published: true,
};
export default function Admin() {
  const [faceConfig, setFaceConfig] = useState<FaceCalibrationConfig>(
    defaultCalibration("earring"),
  );
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeForm, setStoreForm] = useState({ ...emptyStore });
  const [productForm, setProductForm] = useState({ ...emptyProduct });
  const [editStore, setEditStore] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<string | null>(null);
  const [mode, setMode] = useState<"stores" | "store" | "product">("stores");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function feedback(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
    setMessage("");
  }
  async function loadStores(t = token) {
    try {
      const data = await request<Store[]>("/api/admin/stores", {}, t);
      setStores(data);
      return data;
    } catch (e) {
      feedback(e);
      return [];
    }
  }
  async function loadProducts(s: Store, t = token) {
    try {
      const data = await request<Product[]>(
        "/api/admin/stores/" + s.id + "/products",
        {},
        t,
      );
      setProducts(data);
    } catch (e) {
      feedback(e);
    }
  }
  useEffect(() => {
    const existing = sessionStorage.getItem("goldar_token");
    if (existing) {
      setToken(existing);
      loadStores(existing);
    }
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await request<{ access_token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.access_token);
      sessionStorage.setItem("goldar_token", data.access_token);
      setPassword("");
      await loadStores(data.access_token);
    } catch (e) {
      feedback(e);
    } finally {
      setLoading(false);
    }
  }
  function chooseStore(s: Store) {
    setSelected(s);
    setMode("stores");
    setEditStore(null);
    loadProducts(s);
  }
  function startStore(s?: Store) {
    setStoreForm(
      s
        ? {
            name: s.name,
            slug: s.slug,
            tagline: s.tagline,
            description: s.description,
            logo_url: s.logo_url,
            cover_url: s.cover_url,
            theme: s.theme,
            contact_url: s.contact_url,
            published: s.published,
          }
        : { ...emptyStore },
    );
    setEditStore(s?.id || null);
    setMode("store");
    setError("");
    setMessage("");
  }
  function startProduct(p?: Product) {
    setFaceConfig(p ? resolveCalibration(p) : defaultCalibration("earring"));
    setProductForm(
      p
        ? {
            name: p.name,
            slug: p.slug,
            description: p.description,
            category: p.category,
            metal: p.metal,
            weight_grams: p.weight_grams,
            size_label: p.size_label,
            cover_url: p.cover_url,
            glb_url: p.glb_url,
            usdz_url: p.usdz_url,
            scale: p.scale,
            ar_enabled: p.ar_enabled,
            published: p.published,
          }
        : { ...emptyProduct },
    );
    setEditProduct(p?.id || null);
    setMode("product");
    setError("");
    setMessage("");
  }
  async function saveStore(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const s = await request<Store>(
        editStore ? "/api/admin/stores/" + editStore : "/api/admin/stores",
        {
          method: editStore ? "PATCH" : "POST",
          body: JSON.stringify(storeForm),
        },
        token,
      );
      await loadStores();
      setSelected(s);
      await loadProducts(s);
      setMode("stores");
      setMessage("Store saved successfully");
    } catch (e) {
      feedback(e);
    } finally {
      setLoading(false);
    }
  }
  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const saved = await request<Product>(
        editProduct
          ? "/api/admin/products/" + editProduct
          : "/api/admin/stores/" + selected.id + "/products",
        {
          method: editProduct ? "PATCH" : "POST",
          body: JSON.stringify(productForm),
        },
        token,
      );
      if (["earring", "necklace"].includes(productForm.category)) {
        await request(
          "/api/admin/products/" + saved.id + "/face-calibration",
          { method: "PUT", body: JSON.stringify(faceConfig) },
          token,
        );
      }
      await loadProducts(selected);
      setMode("stores");
      setMessage("Product and calibration saved");
    } catch (e) {
      feedback(e);
    } finally {
      setLoading(false);
    }
  }
  async function removeStore(s: Store) {
    if (!confirm("Delete " + s.name + " and all its products?")) return;
    try {
      await request("/api/admin/stores/" + s.id, { method: "DELETE" }, token);
      setSelected(null);
      setProducts([]);
      await loadStores();
      setMessage("Store removed");
    } catch (e) {
      feedback(e);
    }
  }
  async function removeProduct(p: Product) {
    if (!selected || !confirm("Delete " + p.name + "?")) return;
    try {
      await request("/api/admin/products/" + p.id, { method: "DELETE" }, token);
      await loadProducts(selected);
    } catch (e) {
      feedback(e);
    }
  }
  const textField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = "",
    wide = false,
  ) => (
    <label className={"field " + (wide ? "wide" : "")}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
  if (!token)
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
          background: "#191b18",
        }}
      >
        <form
          onSubmit={login}
          className="admin-card"
          style={{ width: "min(440px,100%)", padding: 45 }}
        >
          <p className="eyebrow">Private console</p>
          <h1 className="serif" style={{ fontSize: 75, margin: "10px 0 20px" }}>
            Goldar
          </h1>
          <p className="muted">Sign in to your private atelier</p>
          <div style={{ display: "grid", gap: 16, marginTop: 28 }}>
            {textField("Email", email, setEmail)}
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={loading}>
              Sign in →
            </button>
          </div>
        </form>
      </main>
    );
  return (
    <main className="admin">
      <aside className="sidebar">
        <div className="brandmark">
          Goldar
          <span
            style={{
              fontFamily: "Arial",
              fontSize: 8,
              display: "block",
              letterSpacing: 3,
            }}
          >
            ATELIER CONSOLE
          </span>
        </div>
        <nav>
          <button
            className="active"
            onClick={() => {
              setMode("stores");
              setSelected(null);
              loadStores();
            }}
          >
            Stores
          </button>
          <button onClick={() => startStore()}>+ New store</button>
          <button
            onClick={() => {
              sessionStorage.removeItem("goldar_token");
              setToken("");
            }}
          >
            Sign out
          </button>
        </nav>
      </aside>
      <div className="admin-main">
        <p className="eyebrow">Goldar Studio / Administration</p>
        <h1>
          {mode === "store"
            ? editStore
              ? "Edit store"
              : "New atelier"
            : mode === "product"
              ? editProduct
                ? "Edit jewelry"
                : "New jewelry"
              : selected
                ? selected.name
                : "Your ateliers"}
        </h1>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {mode === "store" && (
          <form className="admin-card" onSubmit={saveStore}>
            <h2>Atelier identity</h2>
            <div className="form-grid">
              {textField("Store name", storeForm.name, (v) =>
                setStoreForm((p) => ({
                  ...p,
                  name: v,
                  slug: editStore ? p.slug : slugify(v),
                })),
              )}
              {textField("Store URL slug", storeForm.slug, (v) =>
                setStoreForm((p) => ({ ...p, slug: v })),
              )}
              {textField("Hero heading", storeForm.tagline, (v) =>
                setStoreForm((p) => ({ ...p, tagline: v })),
              )}
              {textField("Contact / WhatsApp URL", storeForm.contact_url, (v) =>
                setStoreForm((p) => ({ ...p, contact_url: v })),
              )}
              <label className="field wide">
                Description
                <textarea
                  value={storeForm.description}
                  onChange={(e) =>
                    setStoreForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                Visual theme
                <select
                  value={storeForm.theme}
                  onChange={(e) =>
                    setStoreForm((p) => ({ ...p, theme: e.target.value }))
                  }
                >
                  <option value="ivory">Ivory Atelier</option>
                  <option value="midnight">Midnight Noir</option>
                  <option value="champagne">Champagne Gold</option>
                </select>
              </label>
              <label className="field">
                Visibility
                <select
                  value={String(storeForm.published)}
                  onChange={(e) =>
                    setStoreForm((p) => ({
                      ...p,
                      published: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Public</option>
                  <option value="false">Private</option>
                </select>
              </label>
              {textField(
                "Store cover image URL",
                storeForm.cover_url,
                (v) => setStoreForm((p) => ({ ...p, cover_url: v })),
                "https://cdn.example.com/cover.webp",
                true,
              )}
              {textField(
                "Store logo URL",
                storeForm.logo_url,
                (v) => setStoreForm((p) => ({ ...p, logo_url: v })),
                "https://cdn.example.com/logo.png",
                true,
              )}
            </div>
            <div className="admin-actions">
              <button className="btn" disabled={loading}>
                Save store
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setMode("stores")}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {mode === "product" && (
          <form className="admin-card" onSubmit={saveProduct}>
            <h2>Jewelry details</h2>
            <div className="form-grid">
              {textField("Name", productForm.name, (v) =>
                setProductForm((p) => ({
                  ...p,
                  name: v,
                  slug: editProduct ? p.slug : slugify(v),
                })),
              )}
              {textField("Product slug", productForm.slug, (v) =>
                setProductForm((p) => ({ ...p, slug: v })),
              )}
              <label className="field">
                Category
                <select
                  value={productForm.category}
                  onChange={(e) => {
                    setProductForm((p) => ({ ...p, category: e.target.value }));
                    setFaceConfig(defaultCalibration(e.target.value));
                  }}
                >
                  {!["earring", "necklace"].includes(productForm.category) && (
                    <option value={productForm.category} disabled>
                      {productForm.category} (retired fitting)
                    </option>
                  )}
                  {["earring", "necklace"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {textField("Metal & material", productForm.metal, (v) =>
                setProductForm((p) => ({ ...p, metal: v })),
              )}
              {textField("Size label", productForm.size_label, (v) =>
                setProductForm((p) => ({ ...p, size_label: v })),
              )}
              <label className="field">
                Weight (grams)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.weight_grams ?? ""}
                  onChange={(e) =>
                    setProductForm((p) => ({
                      ...p,
                      weight_grams:
                        e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="field wide">
                Description
                <textarea
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              {textField(
                "Cover image CDN URL",
                productForm.cover_url,
                (v) => setProductForm((p) => ({ ...p, cover_url: v })),
                "https://cdn.example.com/product.webp",
                true,
              )}
              {textField(
                "GLB model CDN URL (single earring or necklace)",
                productForm.glb_url,
                (v) => setProductForm((p) => ({ ...p, glb_url: v })),
                "https://cdn.example.com/earring.glb",
                true,
              )}
              {textField(
                "USDZ model CDN URL (Apple Quick Look)",
                productForm.usdz_url,
                (v) => setProductForm((p) => ({ ...p, usdz_url: v })),
                "https://cdn.example.com/earring.usdz",
                true,
              )}
              <div className="wide">
                <button
                  className="btn ghost"
                  disabled={
                    !["earring", "necklace"].includes(productForm.category)
                  }
                  type="button"
                  onClick={() => {
                    setProductForm((p) => ({
                      ...p,
                      glb_url: "/models/sample-" + p.category + ".glb",
                    }));
                    setFaceConfig(defaultCalibration(productForm.category));
                  }}
                >
                  {productForm.category === "necklace"
                    ? "Use Emerald Halo necklace model"
                    : "Use sample earring model"}
                </button>
                <p className="muted">
                  Sample assets are for testing placement. Replace them with
                  your own jewelry before publishing a real product.
                </p>
              </div>
              <p
                className="muted wide"
                style={{ fontSize: 12, lineHeight: 1.8 }}
              >
                URL-only workflow: Goldar stores links, not files. The GLB must
                be publicly reachable over HTTPS with CORS enabled. Verify that
                your CDN serves actual GLB bytes, not an HTML error page.
              </p>
              <label className="field">
                AR placement scale
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={productForm.scale}
                  onChange={(e) =>
                    setProductForm((p) => ({
                      ...p,
                      scale: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <div
                className="wide"
                style={{ padding: "20px 0", borderTop: "1px solid #aaa" }}
              >
                <h3>Jewelry fitting calibration</h3>
                <p className="muted">
                  Earring: upload ONE earring, oriented upright. Necklace:
                  upload the complete 3D necklace with a rear arc, not a flat
                  ring. Set the model height and attachment point; preview
                  sizing is relative to an estimated face width, not a physical
                  measurement.
                </p>
                <div className="form-grid">
                  <label className="field">
                    Model height (mm)
                    <input
                      type="number"
                      min="2"
                      max="600"
                      required
                      value={faceConfig.height_mm}
                      onChange={(e) =>
                        setFaceConfig((p) => ({
                          ...p,
                          height_mm: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Ear placement
                    <select
                      value={faceConfig.side}
                      onChange={(e) =>
                        setFaceConfig((p) => ({
                          ...p,
                          side: e.target.value as FaceCalibrationConfig["side"],
                        }))
                      }
                    >
                      {["both", "left", "right"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Ear anchor mode
                    <select
                      value={faceConfig.ear_anchor ?? "auto"}
                      onChange={(e) =>
                        setFaceConfig((p) => ({
                          ...p,
                          ear_anchor: e.target.value as "auto" | "lobe",
                        }))
                      }
                    >
                      <option value="auto">
                        Automatic (tracked lobe only)
                      </option>
                      <option value="lobe">
                        Tracked lobe only (hide when lost)
                      </option>
                    </select>
                  </label>
                  {(["offset_mm", "rotation_deg", "anchor"] as const).map(
                    (field) => (
                      <label className="field" key={field}>
                        {field === "anchor"
                          ? "Model anchor (0–1, x/y/z)"
                          : field === "offset_mm"
                            ? "Offset (mm, x/y/z)"
                            : "Rotation (degrees, x/y/z)"}
                        <div style={{ display: "flex", gap: 5 }}>
                          {([0, 1, 2] as const).map((i) => (
                            <input
                              key={i}
                              aria-label={field + " " + ["X", "Y", "Z"][i]}
                              type="number"
                              required
                              step="any"
                              min={
                                field === "anchor"
                                  ? 0
                                  : field === "rotation_deg"
                                    ? -360
                                    : -1000
                              }
                              max={
                                field === "anchor"
                                  ? 1
                                  : field === "rotation_deg"
                                    ? 360
                                    : 1000
                              }
                              value={faceConfig[field][i]}
                              onChange={(e) =>
                                setFaceConfig((p) => {
                                  const next = [...p[field]] as [
                                    number,
                                    number,
                                    number,
                                  ];
                                  next[i] = Number(e.target.value);
                                  return { ...p, [field]: next };
                                })
                              }
                            />
                          ))}
                        </div>
                      </label>
                    ),
                  )}
                </div>
                <p className="muted">
                  Top-centre anchor: 0.5 / 1 / 0.5. Necklace preview follows the
                  head; shoulder tracking is not included.
                </p>
              </div>
              <label className="field">
                AR enabled
                <select
                  value={String(productForm.ar_enabled)}
                  onChange={(e) =>
                    setProductForm((p) => ({
                      ...p,
                      ar_enabled: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="field">
                Visibility
                <select
                  value={String(productForm.published)}
                  onChange={(e) =>
                    setProductForm((p) => ({
                      ...p,
                      published: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Public</option>
                  <option value="false">Private</option>
                </select>
              </label>
            </div>
            <div className="admin-actions">
              <button className="btn" disabled={loading}>
                Save jewelry
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setMode("stores")}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {mode === "stores" && (
          <>
            {!selected ? (
              <>
                <div className="admin-actions" style={{ marginBottom: 30 }}>
                  <button className="btn" onClick={() => startStore()}>
                    + Create store
                  </button>
                </div>
                <div className="admin-grid">
                  {stores.map((s) => (
                    <div className="store-tile" key={s.id}>
                      <p className="eyebrow">
                        {s.published ? "Live window" : "Hidden window"}
                      </p>
                      <h3>{s.name}</h3>
                      <p className="muted" style={{ fontSize: 12 }}>
                        /s/{s.slug}
                      </p>
                      <div className="admin-actions">
                        <button
                          className="btn ghost"
                          onClick={() => chooseStore(s)}
                        >
                          Manage →
                        </button>
                        <button
                          className="small-link"
                          onClick={() => startStore(s)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!stores.length && (
                  <div className="admin-card">
                    No ateliers yet. Create your first jewelry store.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="admin-actions" style={{ marginBottom: 28 }}>
                  <button
                    className="btn ghost"
                    onClick={() => setSelected(null)}
                  >
                    ← All stores
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => startStore(selected)}
                  >
                    Edit store
                  </button>
                  <a
                    className="btn ghost"
                    href={"/s/" + selected.slug}
                    target="_blank"
                  >
                    Open display ↗
                  </a>
                  <button className="btn" onClick={() => startProduct()}>
                    + Add jewelry
                  </button>
                </div>
                <div className="admin-card">
                  <p className="eyebrow">Interactive shop window</p>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
                    Open this link on the window display, connect a webcam, and start the mirror.
                    Visitors switch jewelry with a raised hand swipe. Only published earrings and
                    necklaces with a 3D model and AR enabled appear on the display.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 26,
                      flexWrap: "wrap",
                    }}
                  >
                    <QRCodeSVG
                      value={
                        typeof window !== "undefined"
                          ? location.origin + "/s/" + selected.slug
                          : "/s/" + selected.slug
                      }
                      size={110}
                    />
                    <div>
                      <p style={{ fontSize: 13 }}>
                        {typeof window !== "undefined"
                          ? location.origin + "/s/" + selected.slug
                          : "/s/" + selected.slug}
                      </p>
                      <button
                        className="small-link"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            location.origin + "/s/" + selected.slug,
                          )
                        }
                      >
                        Copy display link
                      </button>
                    </div>
                  </div>
                </div>
                <div className="admin-card">
                  <h2>
                    Jewelry inventory{" "}
                    <span className="muted">({products.length})</span>
                  </h2>
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Piece</th>
                          <th>Category</th>
                          <th>3D assets</th>
                          <th>AR / QR</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <p className="muted" style={{ fontSize: 11 }}>
                                {p.slug}
                              </p>
                            </td>
                            <td>{p.category}</td>
                            <td>
                              {p.glb_url ? "GLB ✓" : "—"} /{" "}
                              {p.usdz_url ? "USDZ ✓" : "—"}
                            </td>
                            <td>
                              <a
                                className="small-link"
                                href={"/ar/" + p.id}
                                target="_blank"
                              >
                                Open AR ↗
                              </a>
                              <div>
                                <QRCodeSVG
                                  value={
                                    typeof window !== "undefined"
                                      ? location.origin + "/ar/" + p.id
                                      : "/ar/" + p.id
                                  }
                                  size={60}
                                />
                              </div>
                              <button
                                className="small-link"
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    location.origin + "/ar/" + p.id,
                                  )
                                }
                              >
                                Copy link
                              </button>
                            </td>
                            <td>
                              <button
                                className="small-link"
                                onClick={() => startProduct(p)}
                              >
                                Edit
                              </button>
                              <button
                                className="small-link"
                                onClick={() => removeProduct(p)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!products.length && (
                      <p className="muted">
                        No pieces yet. Upload your first 3D jewelry design.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  className="small-link"
                  style={{ color: "#933" }}
                  onClick={() => removeStore(selected)}
                >
                  Delete this atelier
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
