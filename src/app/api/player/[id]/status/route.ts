import { revalidateTag } from "next/cache";
import { getFullStatus, playerTag } from "@/data/gmc-index";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const status = await getFullStatus(id);
    // Fiche complète arrivée : la prochaine visite ne sert plus la version légère.
    if (!status.light) revalidateTag(playerTag(id), { expire: 0 });
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Index momentanément indisponible." },
      { status: 503 },
    );
  }
}
