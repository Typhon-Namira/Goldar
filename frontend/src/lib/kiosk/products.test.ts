import { describe, it, expect } from "vitest";
import type { Product } from "../api";
import { nextProductIndex, windowProducts } from "./products";
describe("display inventory", () => {
  it("includes only public supported products with enabled try-on and a model", () => {
    const base = { published: true, ar_enabled: true, category: "earring", glb_url: "/one.glb" } as Product;
    expect(windowProducts([base, { ...base, category: "necklace" }, { ...base, published: false },
      { ...base, ar_enabled: false }, { ...base, glb_url: " " }, { ...base, category: "ring" }])).toHaveLength(2);
  });
  it("wraps both directions and tolerates an empty or single-product display", () => {
    expect(nextProductIndex(0, -1, 3)).toBe(2);
    expect(nextProductIndex(2, 1, 3)).toBe(0);
    expect(nextProductIndex(0, 1, 1)).toBe(0);
    expect(nextProductIndex(0, -1, 0)).toBe(0);
  });
});
