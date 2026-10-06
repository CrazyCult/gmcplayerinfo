import type { Metadata, Viewport } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { text } from "@/lib/i18n";
import { indexEnabled } from "@/data/gmc-index";
import "./globals.css";

const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_SITE_URL || "http://localhost:3000"),
  title: {
    default:
      "GameChase Player Info | Notes, potentiel et simulateur d’entraînement",
    template: "%s | GameChase Player Info",
  },
  description:
    "Fiche complète, notes à chaque poste et coût exact d’entraînement jusqu’au potentiel pour les joueurs GameChase.",
};
export const viewport: Viewport = { themeColor: "#101521" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body>
        <div className="shell">
          <header className="header">
            <Link
              href="/"
              className="brand"
              aria-label="GameChase Player Info, accueil"
            >
              <span className="logo">G</span>
              <span className="brand-word">
                GAMECHASE<span>PLAYER INFO</span>
              </span>
            </Link>
            <nav className="nav" aria-label="Navigation principale">
              <Link href="/players">Tous les joueurs</Link>
              <Link href="/squad">Mon effectif</Link>
              <Link href="/compare">Comparer</Link>
              <span className="status">
                <span className="status-dot" />
                {indexEnabled() ? "Index GMC Companion" : "Mode import local"}
              </span>
            </nav>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            <span>
              {text.disclaimer}
              <br />
              {text.community}
            </span>
            <span>
              GMC COMPANION · PLAYER INFO
              <br />
              Par CrazyCult (L’Icaunique)
            </span>
          </footer>
        </div>
        <Toaster richColors />
      </body>
    </html>
  );
}
