"use client";

import { useSyncExternalStore } from "react";
import { get, set } from "idb-keyval";
import { DEFAULT_COACHES, type CoachLevels } from "@/engine/tables";
import { validateSettings } from "@/engine/training";

// Réglages d’entraînement du club (niveaux des coachs et du centre), mémorisés
// dans ce navigateur et partagés par le simulateur, les leviers d’OVR et le
// tableau d’effectif, pour que tous les chiffres collent à ceux du jeu.

const KEY = "gmc-training-settings";
export interface ClubSettings {
  coaches: CoachLevels;
  center: number;
  /** Faux tant que l’utilisateur n’a rien enregistré. */
  saved: boolean;
}
const FALLBACK: ClubSettings = {
  coaches: { ...DEFAULT_COACHES },
  center: 1,
  saved: false,
};
let current = FALLBACK;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function load() {
  loading ??= get<{ coaches: CoachLevels; center: number }>(KEY)
    .then((stored) => {
      if (!stored) return;
      validateSettings(stored.coaches, stored.center, 0);
      current = { coaches: stored.coaches, center: stored.center, saved: true };
      emit();
    })
    .catch(() => {
      /* Rien de mémorisé ou réglages invalides : valeurs par défaut. */
    });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

export function useClubSettings(): ClubSettings {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => FALLBACK,
  );
}
export async function saveClubSettings(coaches: CoachLevels, center: number) {
  validateSettings(coaches, center, 0);
  current = { coaches: { ...coaches }, center, saved: true };
  emit();
  // L’âge était autrefois rangé avec les réglages : on garde la même clé.
  await set(KEY, { coaches: current.coaches, center });
}
export const coachSummary = (s: ClubSettings) =>
  `coachs ${s.coaches.att}/${s.coaches.mid}/${s.coaches.def}/${s.coaches.gk}/${s.coaches.physio} · centre ${s.center}`;
