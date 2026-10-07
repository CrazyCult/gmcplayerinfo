"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Connexion Google, en haut à droite de toutes les pages. */
export default function HeaderAccount() {
  const [state, setState] = useState<{
    enabled: boolean;
    name: string | null;
  } | null>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => alive && setState(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!state?.enabled) return null;
  const here = `${pathname}${search.size ? `?${search}` : ""}`;
  return state.name !== null ? (
    <form action="/api/auth/logout" method="post" className="account">
      <a className="account-name" href="/compte" title="Mon compte">
        {state.name || "Connecté"}
      </a>
      <input type="hidden" name="next" value={here} />
      <button className="pill" type="submit">
        Déconnexion
      </button>
    </form>
  ) : (
    <a
      className="button account-login"
      href={`/api/auth/google?next=${encodeURIComponent(here)}`}
    >
      Se connecter avec Google
    </a>
  );
}
