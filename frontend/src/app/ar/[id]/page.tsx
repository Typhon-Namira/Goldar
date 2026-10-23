import { API, Product, Store } from "@/lib/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import ModelViewer from "@/components/ModelViewer";
import FaceAtelier from "@/components/FaceAtelier";
export default async function ARPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await fetch(
    API + "/api/public/products/" + encodeURIComponent(id),
    { cache: "no-store" },
  );
  if (!response.ok) notFound();
  const { product: p, store: s }: { product: Product; store: Store } =
    await response.json();
  const face = p.category === "earring" || p.category === "necklace";
  return (
    <main className="catalog luxe-catalog">
      <div className="luxe-topline">
        GOLDAR IMMERSIVE STUDIO <span>AN INTERACTIVE JEWELRY EXPERIENCE</span>{" "}
        MOBILE ATELIER
      </div>
      <header className="container catalog-header luxe-nav">
        <Link href={"/s/" + s.slug + "/p/" + p.slug} className="luxe-nav-link">
          ← THE PIECE
        </Link>
        <Link className="brandmark luxe-wordmark" href={"/s/" + s.slug}>
          {s.name}
        </Link>
        <div className="luxe-nav-actions">
          <Link href={"/s/" + s.slug}>COLLECTION ↗</Link>
        </div>
      </header>
      <section className="container ar-page">
        <div className="ar-page-heading">
          <p className="eyebrow">GOLDAR / THE FITTING ROOM</p>
          <h1 className="serif">
            Experience <em>{p.name}.</em>
          </h1>
          <p>Discover the piece on your own terms, in every dimension.</p>
        </div>
        {face && p.ar_enabled && p.glb_url ? (
          <FaceAtelier product={p} />
        ) : (
          <div className="ar-unavailable">
            <h2 className="serif">
              Face fitting supports earrings and necklaces.
            </h2>
            <p>
              Choose an earring or necklace with an enabled 3D model to start
              your preview.
            </p>
          </div>
        )}
        <div className="ar-native">
          <div>
            <p className="eyebrow">THE OBJECT IN THREE DIMENSIONS</p>
            <h2 className="serif">Explore every detail.</h2>
            <p>
              Turn the piece in 3D or use native AR to place it in your
              surroundings, where supported. This is separate from live body
              tracking.
            </p>
          </div>
          <div className="ar-native-view">
            <ModelViewer
              glb={p.glb_url}
              usdz={p.usdz_url}
              poster={p.cover_url}
              ar={p.ar_enabled}
              alt={p.name}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
