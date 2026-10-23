import Link from "next/link";
export default function FittingGuide() {
  return (
    <main className="container ar-page">
      <div className="ar-page-heading">
        <p className="eyebrow">GOLDAR / THE FITTING ROOM</p>
        <h1 className="serif">
          A new <em>perspective.</em>
        </h1>
        <p>
          Open an earring or necklace from your collection and choose face
          fitting. Look at the camera in soft, even light. Keep your ears
          visible for earrings.
        </p>
        <p>
          The preview helps you explore the design. It does not measure your
          physical size.
        </p>
        <Link className="btn gold" href="/admin">
          Open your studio →
        </Link>
      </div>
    </main>
  );
}
