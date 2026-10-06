"use client";

import { get, set, del } from "idb-keyval";
import { useEffect, useSyncExternalStore } from "react";
import { parseSquad, type ImportWarning } from "@/schemas/player";
import type { Player } from "@/types";

interface State {
  players: Player[];
  warnings: ImportWarning[];
  loading: boolean;
  error: string | null;
}
const empty: State = { players: [], warnings: [], loading: true, error: null };
let state = empty;
let hydration: Promise<void> | undefined;
const listeners = new Set<() => void>();
function publish(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function hydrate() {
  hydration ??= get("gmc-squad")
    .then((input) => {
      const result = input ? parseSquad(input) : { players: [], warnings: [] };
      publish({ ...result, loading: false, error: null });
    })
    .catch(() =>
      publish({
        ...empty,
        loading: false,
        error:
          "Le stockage local est inaccessible ou contient un import invalide. Réimportez votre effectif.",
      }),
    );
  return hydration;
}
export function useSquad() {
  useEffect(() => {
    void hydrate();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
}
export async function importSquad(input: unknown) {
  const result = parseSquad(input);
  await hydrate();
  await set("gmc-squad", result.players);
  publish({ ...result, loading: false, error: null });
  return result;
}
export async function clearSquad() {
  await hydrate();
  await del("gmc-squad");
  publish({ players: [], warnings: [], loading: false, error: null });
}
