import Link from "next/link";
import {
  ArrowUpTrayIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Search from "@/components/Search";
import { indexEnabled } from "@/data/gmc-index";

export default function Home() {
  return (
    <div className="home-content">
      <section className="hero">
        <div className="eyebrow">
          <span className="status-dot" />
          Le potentiel fait la différence
        </div>
        <h1>
          Connaissez vos joueurs.
          <br />
          <span>Préparez leur prochain niveau.</span>
        </h1>
        <p>
          Notes par poste, leviers de progression et coût d’entraînement :
          toutes les clés pour construire votre effectif GameChase.
        </p>
        <Search remote={indexEnabled()} />
        <div className="hero-actions">
          <Link href="/players" className="button primary">
            Tous les joueurs GMC Companion
          </Link>
          <Link href="/squad" className="button primary">
            <ArrowUpTrayIcon />
            Importer mon effectif
          </Link>
          <Link href="/compare" className="button">
            <ArrowsRightLeftIcon />
            Comparer deux joueurs
          </Link>
        </div>
        <small style={{ display: "block", marginTop: 20 }}>
          Vos imports restent dans votre navigateur. Aucun compte nécessaire.
        </small>
      </section>
      <div className="feature-grid">
        <section className="feature feature-analyze">
          <ChartBarIcon className="feature-icon" aria-hidden="true" />
          <div className="feature-number">01 / ANALYSER</div>
          <h3>Au-delà de la note globale</h3>
          <p>
            Explorez les sous-attributs et les notes à chaque poste pour trouver
            la place de chaque joueur.
          </p>
        </section>
        <section className="feature feature-training">
          <ArrowTrendingUpIcon className="feature-icon" aria-hidden="true" />
          <div className="feature-number">02 / DÉVELOPPER</div>
          <h3>Chaque séance compte</h3>
          <p>
            Simulez les vrais gains selon l’âge, les coachs et le potentiel.
            Anticipez votre budget en GMC2.
          </p>
        </section>
        <section className="feature feature-decide">
          <UserGroupIcon className="feature-icon" aria-hidden="true" />
          <div className="feature-number">03 / DÉCIDER</div>
          <h3>Un effectif, une vue claire</h3>
          <p>
            Comparez vos joueurs et repérez ceux qui disposent de la meilleure
            marge de progression.
          </p>
        </section>
      </div>
      <div className="notice">
        {indexEnabled()
          ? "Index GMC Companion · Tous les joueurs déjà collectés par l’extension, mis à jour au fil des collectes."
          : "Mode import local · La connexion communautaire doit être activée sur le serveur."}
      </div>
    </div>
  );
}
