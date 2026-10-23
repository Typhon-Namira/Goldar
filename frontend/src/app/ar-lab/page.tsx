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
          Open a ring from your collection and choose virtual fitting. Place one
          hand in soft, even light, gently separate your fingers, and move
          slowly to explore the piece.
        </p>
        <p>
          The preview helps you explore the design. It does not measure your
          ring size.
        </p>
        <Link className="btn gold" href="/admin">
          Open your studio →
        </Link>
      </div>
    </main>
  );
}
