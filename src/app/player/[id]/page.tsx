import { notFound } from "next/navigation";
import LocalPlayer from "@/components/LocalPlayer";
import Search from "@/components/Search";
import PlayerView from "@/components/PlayerView";
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
      description: `Attributs, notes par poste et simulation d’entraînement de ${player.name}, joueur GameChase collecté par GMC Companion.`,
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
    let snapshot;
    try {
      snapshot = await getPlayer(id);
    } catch (error) {
      if (error instanceof IndexError && error.status === 404) notFound();
    }
    if (!snapshot)
      return (
        <div className="notice">
          Impossible de charger ce joueur depuis l’index. Réessayez dans
          quelques instants.
        </div>
      );
    return (
      <>
        <Search remote={indexEnabled()} />
        <p className="notice">
          Collecté le{" "}
          {new Date(snapshot.fetchedAt).toLocaleString("fr-CH", {
            timeZone: "Europe/Zurich",
          })}{" "}
          par GMC Companion.
        </p>
        <PlayerView player={snapshot.player} remote />
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
