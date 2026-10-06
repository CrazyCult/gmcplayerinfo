import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <div className="eyebrow" style={{ justifyContent: "center" }}>
        404
      </div>
      <h1>Joueur introuvable</h1>
      <p>En mode local, ouvrez une fiche depuis votre effectif importé.</p>
      <Link href="/squad" className="button primary">
        Mon effectif
      </Link>
    </div>
  );
}
