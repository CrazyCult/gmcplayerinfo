"use client";
import { appearanceStorage, type Appearance } from "./appearance";
export const APPEARANCE_EVENT = "gmc-theme-change";
let interaction = 0;
export const appearanceRevision = () => interaction;
export function currentAppearance(): Appearance {
  if (document.documentElement.dataset.skin === "manga") return "manga";
  const theme = document.documentElement.dataset.theme;
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
export function applyAppearance(appearance: Appearance, userAction = true) {
  if (userAction) interaction++;
  document.documentElement.dataset.skin =
    appearance === "manga" ? "manga" : "classic";
  document.documentElement.dataset.theme =
    appearance === "manga" ? "dark" : appearance;
  try {
    for (const [key, value] of Object.entries(appearanceStorage(appearance)))
      localStorage.setItem(key, value);
  } catch {
    /* The current tab still works when storage is unavailable. */
  }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}
export function subscribeAppearance(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const storage = (event: StorageEvent) => {
    if (
      event.key !== "gmc-theme" &&
      event.key !== "gmc-skin" &&
      event.key !== null
    )
      return;
    try {
      const skin = localStorage.getItem("gmc-skin"),
        theme = localStorage.getItem("gmc-theme");
      document.documentElement.dataset.skin =
        skin === "manga" ? "manga" : "classic";
      if (skin === "manga") document.documentElement.dataset.theme = "dark";
      else if (theme === "light" || theme === "dark")
        document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
      interaction++;
      onChange();
    } catch {
      /* Keep the current appearance. */
    }
  };
  media.addEventListener("change", onChange);
  window.addEventListener(APPEARANCE_EVENT, onChange);
  window.addEventListener("storage", storage);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(APPEARANCE_EVENT, onChange);
    window.removeEventListener("storage", storage);
  };
}
