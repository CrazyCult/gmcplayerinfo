"use client";
import Link from "next/link";
import { useSquad } from "@/lib/local-squad";
import PlayerView from "./PlayerView";

export default function LocalPlayer({
  id,
  trainingOnly = false,
}: {
  id: string;
  trainingOnly?: boolean;
}) {
  const { players, loading, warnings, error } = useSquad();
  const player = players.find(
    (player) => player.id === id.replace(/^local:/, ""),
  );
  if (loading)
    return (
      <div className="empty" role="status">
        <span className="spinner" /> Chargement de l’effectif local…
      </div>
    );
  if (!player)
    return (
      <div className="empty">
        <h2>Joueur absent de cet appareil</h2>
        <p>
          {error ||
            "Importez l’effectif qui contient ce joueur pour ouvrir sa fiche."}
        </p>
        <Link className="button primary" href="/squad">
          Importer mon effectif
        </Link>
      </div>
    );
  return (
    <>
      {warnings
        .filter((w) => w.id === player.id)
        .map((w) => (
          <div className="notice warning" key={w.id}>
            {w.message}
          </div>
        ))}
      <PlayerView key={player.id} player={player} trainingOnly={trainingOnly} />
    </>
  );
}
