import { notFound } from "next/navigation";
import LocalPlayer from "@/components/LocalPlayer";
import Search from "@/components/Search";
import PlayerView from "@/components/PlayerView";
import MarketPanel from "@/components/MarketPanel";
import OvrHistory from "@/components/OvrHistory";
import Fold from "@/components/UI/Fold";
import { parseOverallHistory } from "@/engine/progression";
import { getPlayer, IndexError, indexEnabled } from "@/data/gmc-index";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let id;
  try {
    id = decodeURIComponent((await params).id);
  } catch {
    return { title: "Joueur introuvable" };
  }
  if (id.startsWith("local:"))
    return {
      title: "Fiche joueur locale",
      robots: { index: false, follow: false },
    };
  try {
    const { player } = await getPlayer(id);
    return {
      title: `${player.name} · ${player.position} · OVR ${player.overall} / POT ${player.potential}`,
      description: `Attributs, notes par poste et simulation d’entraînement de ${player.name}, joueur GameChase.`,
      alternates: { canonical: `/player/${encodeURIComponent(id)}` },
    };
  } catch {
    return { title: "Fiche joueur", robots: { index: false, follow: false } };
  }
}
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: segment } = await params;
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    notFound();
  }
  if (!id.startsWith("local:")) {
    let snapshot,
      code = "?";
    try {
      snapshot = await getPlayer(id);
    } catch (error) {
      if (error instanceof IndexError && error.status === 404) notFound();
      code = error instanceof IndexError ? String(error.status) : "app";
    }
    if (!snapshot)
      return (
        <div className="notice">
          Impossible de charger ce joueur depuis l’index. Réessayez dans
          quelques instants. <small className="muted">(code {code})</small>
        </div>
      );
    const history = parseOverallHistory(snapshot.history);
    return (
      <>
        <Search remote={indexEnabled()} />
        <p className="notice">
          {snapshot.light ? "Vu dans la base du jeu le" : "Collecté le"}{" "}
          {new Date(snapshot.fetchedAt).toLocaleString("fr-CH", {
            timeZone: "Europe/Zurich",
          })}{" "}
          par GMC Companion.
        </p>
        <PlayerView
          player={snapshot.player}
          remote
          club={snapshot.club}
          full={snapshot.light ? {} : undefined}
        />
        <div className="stack" style={{ marginTop: 24 }}>
          <Fold title="Progression réelle" summary={historySummary(history)}>
            <OvrHistory
              points={history}
              potential={snapshot.player.potential}
            />
          </Fold>
          <MarketPanel
            market={snapshot.market}
            prices={snapshot.prices}
            comparables={snapshot.comparables}
            value={snapshot.player.value}
          />
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <Search remote={indexEnabled()} />
      </div>
      <LocalPlayer id={id} />
    </>
  );
}

function historySummary(points: { overall: number }[]) {
  if (points.length < 2) return "Pas encore d’historique relevé";
  const gain = points[points.length - 1].overall - points[0].overall;
  return `${points.length} relevés · ${gain >= 0 ? "+" : ""}${gain} OVR`;
}
