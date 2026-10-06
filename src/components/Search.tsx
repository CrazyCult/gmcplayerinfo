"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useSquad } from "@/lib/local-squad";
import { text } from "@/lib/i18n";
import Rating from "./UI/Rating";
import { playerSummarySchema, type PlayerSummary } from "@/schemas/index";

export default function Search({
  remote = false,
  onSelect,
}: {
  remote?: boolean;
  onSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const { players } = useSquad();
  const [community, setCommunity] = useState<PlayerSummary[]>([]);
  const [remoteError, setRemoteError] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!remote || debounced.length < 3) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Index indisponible");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setCommunity(
            (data.players as { player: unknown }[]).map((row) =>
              playerSummarySchema.parse(row.player),
            ),
          );
          setRemoteError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCommunity([]);
          setRemoteError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [debounced, remote]);
  const results =
    debounced.length >= 3
      ? players
          .filter(
            (player) =>
              player.name
                .toLocaleLowerCase("fr")
                .includes(debounced.toLocaleLowerCase("fr")) ||
              player.id === debounced.replace(/^local:/, ""),
          )
          .sort((a, b) => b.overall - a.overall)
          .slice(0, 10)
      : [];
  const combined = [
    ...community.map((player) => ({ player, remote: true })),
    ...results
      .filter((player) => !community.some((item) => item.id === player.id))
      .map((player) => ({ player, remote: false })),
  ].slice(0, 10);
  return (
    <div className="search-wrap">
      <MagnifyingGlassIcon className="search-icon" aria-hidden="true" />
      <input
        aria-label={text.search}
        placeholder={text.search}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCommunity([]);
          setPending(remote && event.target.value.trim().length >= 3);
          setRemoteError(false);
        }}
        autoComplete="off"
      />
      <span className="search-hint">
        {remote ? "GMC COMPANION" : "EFFECTIF LOCAL"}
      </span>
      {debounced.length >= 3 && (
        <div className="search-results" aria-live="polite">
          {combined.length ? (
            combined.map(({ player, remote: online }) => (
              <Link
                key={player.id}
                href={
                  online
                    ? `/player/${encodeURIComponent(player.id)}`
                    : `/player/local:${player.id}`
                }
                onClick={(event) => {
                  if (onSelect) {
                    event.preventDefault();
                    onSelect(online ? player.id : `local:${player.id}`);
                  }
                  setQuery("");
                  setCommunity([]);
                }}
              >
                <span>
                  <strong>{player.name}</strong>
                  <small>
                    {player.position} · {player.age} ans · potentiel{" "}
                    {player.potential}
                  </small>
                </span>
                <Rating value={player.overall} />
              </Link>
            ))
          ) : (
            <p>
              {pending
                ? "Recherche dans l’index…"
                : remoteError
                  ? "Index indisponible. Votre effectif local reste accessible."
                  : remote
                    ? "Aucun joueur trouvé dans l’index ou votre effectif."
                    : "Aucun joueur trouvé. Importez votre effectif pour le rechercher."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
