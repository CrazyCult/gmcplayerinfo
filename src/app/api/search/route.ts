import { getCatalog, IndexError } from "@/data/gmc-index";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3) return Response.json({ players: [] });
  try {
    const result = await getCatalog({ q, search: true });
    return Response.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  } catch (error) {
    const status =
      error instanceof IndexError && error.status === 429 ? 429 : 503;
    return Response.json(
      { error: "Recherche communautaire indisponible." },
      { status },
    );
  }
}
