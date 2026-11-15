"use client";

import { useId, type ReactNode } from "react";

/**
 * Petite bulle d’info : s’ouvre au survol, au clavier (Tab) et au toucher.
 * Le texte reste lu par les lecteurs d’écran (aria-describedby).
 */
export default function InfoTip({
  label,
  children,
}: {
  /** Nom court lu par les lecteurs d’écran (« Exercice pour Vitesse »). */
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="tip">
      <button type="button" aria-label={label} aria-describedby={id}>
        i
      </button>
      <span role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}
