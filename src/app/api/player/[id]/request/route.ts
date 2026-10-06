import { IndexError, requestFull } from "@/data/gmc-index";

const MESSAGES: Record<number, string> = {
  404: "Joueur introuvable.",
  409: "Agent libre : il n’appartient à aucun club, il n’y a pas d’effectif à lire.",
  429: "Trop de demandes en attente, réessaie un peu plus tard.",
};
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    return Response.json(await requestFull(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof IndexError ? error.status : 503;
    return Response.json(
      { error: MESSAGES[status] ?? "Index momentanément indisponible." },
      { status: MESSAGES[status] ? status : 503 },
    );
  }
}
