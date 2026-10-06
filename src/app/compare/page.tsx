import Comparison from "@/components/Comparison";
import { getPlayer, indexEnabled } from "@/data/gmc-index";
export const metadata = { title: "Comparaison des joueurs" };
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ player1?: string; player2?: string }>;
}) {
  const params = await searchParams;
  const ids = [
    ...new Set(
      [params.player1, params.player2].filter(
        (id): id is string => Boolean(id) && !id!.startsWith("local:"),
      ),
    ),
  ];
  const snapshots = await Promise.allSettled(ids.map((id) => getPlayer(id)));
  const remotePlayers = snapshots.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.player] : [],
  );
  return (
    <Comparison
      key={`${params.player1}-${params.player2}`}
      player1={params.player1}
      player2={params.player2}
      remotePlayers={remotePlayers}
      remote={indexEnabled()}
    />
  );
}
