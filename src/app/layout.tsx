import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import HeaderAccount from "@/components/HeaderAccount";
import ThemeToggle from "@/components/ThemeToggle";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { text } from "@/lib/i18n";
import { indexEnabled } from "@/data/gmc-index";
import { APPEARANCE_BOOTSTRAP } from "@/lib/appearance";
import "./globals.css";
import "./manga.css";

const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_SITE_URL || "http://localhost:3000"),
  title: {
    default: "GMC Player Info | Notes, potentiel et simulateur d’entraînement",
    template: "%s | GMC Player Info",
  },
  description:
    "Fiche complète, notes à chaque poste et coût exact d’entraînement jusqu’au potentiel pour les joueurs GameChase.",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={manrope.variable} suppressHydrationWarning>
      <head>
        {/* Applique le thème choisi avant l’affichage (pas de flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: APPEARANCE_BOOTSTRAP,
          }}
        />
      </head>
      <body>
        <div className="shell">
          <header className="header">
            <Link
              href="/"
              className="brand"
              aria-label="GMC Player Info, accueil"
            >
              <Image
                className="logo"
                src="/brand/gmc-player-info.png"
                alt=""
                width={48}
                height={48}
                priority
              />
              <span className="brand-word">
                GMC<span>PLAYER INFO</span>
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
              <ThemeToggle />
              <Suspense fallback={null}>
                <HeaderAccount />
              </Suspense>
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
              GMC PLAYER INFO · GMC COMPANION
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
