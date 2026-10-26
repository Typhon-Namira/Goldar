import { API, type Store, type Product } from "@/lib/api";
import { notFound } from "next/navigation";
import StoreWindow from "@/components/StoreWindow";
export default async function Storefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await fetch(API + "/api/public/stores/" + encodeURIComponent(slug), { cache: "no-store" });
  if (!response.ok) notFound();
  const data: { store: Store; products: Product[] } = await response.json();
  return <StoreWindow store={data.store} products={data.products} />;
}
