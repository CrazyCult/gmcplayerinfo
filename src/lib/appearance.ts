export const APPEARANCES = ["light", "dark", "manga"] as const;
export type Appearance = (typeof APPEARANCES)[number];
export const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Jour",
  dark: "Nuit",
  manga: "Manga",
};
export function isAppearance(value: unknown): value is Appearance {
  return APPEARANCES.some((appearance) => appearance === value);
}
export function resolveAppearance(
  theme: string | null,
  skin: string | null,
  systemLight: boolean,
): Appearance {
  if (skin === "manga") return "manga";
  return theme === "light" || theme === "dark"
    ? theme
    : systemLight
      ? "light"
      : "dark";
}
/** Manga preserves the last classical theme in storage. */
export function appearanceStorage(appearance: Appearance) {
  return appearance === "manga"
    ? { "gmc-skin": "manga" }
    : { "gmc-theme": appearance, "gmc-skin": "classic" };
}
export const APPEARANCE_BOOTSTRAP =
  "try{var t=localStorage.getItem('gmc-theme'),s=localStorage.getItem('gmc-skin');if(s==='manga'){document.documentElement.dataset.skin='manga';document.documentElement.dataset.theme='dark'}else{document.documentElement.dataset.skin='classic';if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}}catch(e){document.documentElement.dataset.skin='classic'}";
