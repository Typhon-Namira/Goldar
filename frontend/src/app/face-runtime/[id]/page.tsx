import { notFound } from "next/navigation";
import { API, type Product } from "@/lib/api";
import FaceRuntime from "@/components/FaceRuntime";
export default async function Runtime({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ camera?: string }>;
}) {
  const { id } = await params;
  const { camera } = await searchParams;
  const response = await fetch(
    API + "/api/public/products/" + encodeURIComponent(id),
    { cache: "no-store" },
  );
  if (!response.ok) notFound();
  const { product }: { product: Product } = await response.json();
  if (
    !product.ar_enabled ||
    !product.glb_url ||
    !["earring", "necklace"].includes(product.category)
  )
    notFound();
  return (
    <FaceRuntime
      product={product}
      facing={camera === "back" ? "back" : "front"}
    />
  );
}
