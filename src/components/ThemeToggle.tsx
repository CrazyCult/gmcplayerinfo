"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

type Theme = "light" | "dark";
const KEY = "gmc-theme";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

const EVENT = "gmc-theme-change";
function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Passe le site en clair ou en sombre (choix gardé dans ce navigateur). */
export default function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    current,
    () => null,
  );
  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* stockage indisponible : le choix vaut pour cette page */
    }
    window.dispatchEvent(new Event(EVENT));
  }
  const label =
    theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <SunIcon width={18} aria-hidden="true" />
      ) : (
        <MoonIcon width={18} aria-hidden="true" />
      )}
    </button>
  );
}
