import { connection } from "next/server";
import { accountKey, authEnabled, getSession, isPremium } from "@/lib/session";

export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  await connection(); // page propre à chaque visiteur (jamais précalculée)
  const session = authEnabled() ? await getSession() : null;
  if (!session)
    return (
      <section className="card mini-card">
        <h1 className="mini-title">Mon compte</h1>
        <p className="muted">
          Connecte-toi avec Google (en haut à droite) pour voir ta clé de
          compte.
        </p>
      </section>
    );
  const key = await accountKey(session.sub);
  const premium = await isPremium(session);
  return (
    <section className="card mini-card">
      <h1 className="mini-title">Mon compte</h1>
      <p>
        Connecté{session.name ? ` : ${session.name}` : ""}.{" "}
        {premium
          ? "Les modules réservés sont activés pour ce compte."
          : "Les modules réservés ne sont pas activés pour ce compte."}
      </p>
      <p className="muted" style={{ fontSize: 13 }}>
        Clé de compte (à ajouter dans PREMIUM_ACCOUNT_KEYS pour activer les
        modules réservés) :
      </p>
      <code className="account-key">{key}</code>
    </section>
  );
}
