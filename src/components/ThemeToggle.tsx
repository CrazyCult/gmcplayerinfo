"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  APPEARANCES,
  APPEARANCE_LABELS,
  isAppearance,
  type Appearance,
} from "@/lib/appearance";
import {
  applyAppearance,
  appearanceRevision,
  currentAppearance,
  subscribeAppearance,
} from "@/lib/appearance-store";
/** Local appearance, with an optional preference saved to the signed-in account. */
export default function ThemeToggle() {
  const appearance = useSyncExternalStore<Appearance | null>(
    subscribeAppearance,
    currentAppearance,
    () => null,
  );
  useEffect(() => {
    const controller = new AbortController(),
      revision = appearanceRevision();
    async function restore() {
      try {
        const response = await fetch("/api/preferences/appearance", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (
          !controller.signal.aborted &&
          appearanceRevision() === revision &&
          isAppearance(data.appearance)
        )
          applyAppearance(data.appearance, false);
      } catch {
        /* Account service failure does not block local themes. */
      }
    }
    void restore();
    return () => controller.abort();
  }, []);
  return (
    <label className="appearance-control">
      <span className="sr-only">Apparence du site</span>
      <select
        aria-label="Apparence du site"
        title="Jour, Nuit ou Manga"
        value={appearance ?? ""}
        onChange={(event) => {
          if (isAppearance(event.target.value))
            applyAppearance(event.target.value);
        }}
      >
        <option value="" disabled>
          Apparence
        </option>
        {APPEARANCES.map((value) => (
          <option key={value} value={value}>
            {APPEARANCE_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
