import { revalidateTag } from "next/cache";
import { getFullStatus, IndexError, playerTag } from "@/data/gmc-index";

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
  } catch (error) {
    // 404 : joueur inconnu de l’index et aucune demande en cours.
    const missing = error instanceof IndexError && error.status === 404;
    return Response.json(
      {
        error: missing
          ? "Joueur introuvable."
          : "Index momentanément indisponible.",
      },
      { status: missing ? 404 : 503 },
    );
  }
}
