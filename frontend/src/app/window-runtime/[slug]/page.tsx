import { notFound } from "next/navigation";
import { API, type Product } from "@/lib/api";
import { windowProducts } from "@/lib/kiosk/products";
import WindowRuntime from "@/components/WindowRuntime";
export default async function Runtime({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ camera?: string; product?: string }>;
}) {
  const { slug } = await params;
  const { camera, product } = await searchParams;
  const response = await fetch(API + "/api/public/stores/" + encodeURIComponent(slug), { cache: "no-store" });
  if (!response.ok) notFound();
  const data: { products: Product[] } = await response.json();
  const products = windowProducts(data.products);
  if (!products.length) notFound();
  return <WindowRuntime products={products} initialId={product} facing={camera === "back" ? "back" : "front"} />;
}
