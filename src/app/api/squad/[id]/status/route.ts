import { revalidateTag } from "next/cache";
import { clubTag, getClub, playerTag } from "@/data/gmc-index";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    return Response.json({ error: "Club invalide." }, { status: 400 });
  try {
    const club = await getClub(id, { fresh: true });
    if (!club.requestedAt && club.fetchedAt) {
      revalidateTag(clubTag(id), { expire: 0 });
      for (const { player } of club.players)
        revalidateTag(playerTag(player.id), { expire: 0 });
    }
    return Response.json(
      { fetchedAt: club.fetchedAt, requestedAt: club.requestedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Index momentanément indisponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
