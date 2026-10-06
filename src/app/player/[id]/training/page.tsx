import { notFound } from "next/navigation";
import LocalPlayer from "@/components/LocalPlayer";
import PlayerView from "@/components/PlayerView";
import { getPlayer, IndexError } from "@/data/gmc-index";
export const metadata = {
  title: "Simulateur d’entraînement local",
  robots: { index: false, follow: false },
};
export default async function TrainingPage({
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
          Impossible de charger le joueur depuis l’index.
        </div>
      );
    return <PlayerView player={snapshot.player} remote trainingOnly />;
  }
  return <LocalPlayer id={id} trainingOnly />;
}
