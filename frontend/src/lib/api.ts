export type Store = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logo_url: string;
  cover_url: string;
  theme: string;
  contact_url: string;
  published: boolean;
};
export type FaceCalibrationConfig = {
  height_mm: number;
  offset_mm: [number, number, number];
  rotation_deg: [number, number, number];
  anchor: [number, number, number];
  side: "both" | "left" | "right";
  ear_anchor: "auto" | "lobe";
};
export type Product = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  metal: string;
  weight_grams: number | null;
  size_label: string;
  cover_url: string;
  glb_url: string;
  usdz_url: string;
  scale: number;
  face_calibration: FaceCalibrationConfig | null;
  ar_enabled: boolean;
  published: boolean;
  product_url: string;
  ar_url: string;
};
export const API = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(API + path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(
      typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail),
    );
  }
  return (response.status === 204 ? null : await response.json()) as T;
}
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
