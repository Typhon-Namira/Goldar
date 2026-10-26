import type { Product } from "../api";
export function windowProducts(products: Product[]): Product[] {
  return products.filter((p) => p.published && p.ar_enabled && p.glb_url.trim() &&
    (p.category === "earring" || p.category === "necklace"));
}
export function nextProductIndex(index: number, direction: -1 | 1, count: number) {
  return count > 0 ? ((index + direction) % count + count) % count : 0;
}
