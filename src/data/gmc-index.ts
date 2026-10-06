import "server-only";
import { cache } from "react";
import { z } from "zod";
import { playerSchema } from "@/schemas/player";
import { playerSummarySchema } from "@/schemas/index";

export const indexEnabled = () => Boolean(process.env.GMC_SITE_TOKEN);
const snapshotSchema = z.object({
  player: playerSchema,
  fetchedAt: z.number().finite(),
  teamId: z.string(),
});
const catalogSchema = z.object({
  players: z.array(snapshotSchema.extend({ player: playerSummarySchema })),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});

export class IndexError extends Error {
  constructor(public status: number) {
    super(
      status === 503
        ? "L’index communautaire n’est pas encore connecté."
        : "L’index communautaire est momentanément indisponible.",
    );
  }
}
async function request(path: string) {
  if (!indexEnabled()) throw new IndexError(503);
  const base =
    process.env.GMC_INDEX_URL ||
    "https://gmc-companion-index.florian-chevalier68.workers.dev";
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${process.env.GMC_SITE_TOKEN}` },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new IndexError(502);
  }
  if (!response.ok) throw new IndexError(response.status);
  return response.json();
}
export const getPlayer = cache(async (id: string) =>
  snapshotSchema.parse(
    await request(`/v1/site/player/${encodeURIComponent(id)}`),
  ),
);
export async function getCatalog({
  q = "",
  position = "",
  page = 1,
  search = false,
}: { q?: string; position?: string; page?: number; search?: boolean } = {}) {
  const params = new URLSearchParams({
    q: q.slice(0, 100),
    position,
    page: String(page),
  });
  return catalogSchema.parse(
    await request(`/v1/site/${search ? "search" : "players"}?${params}`),
  );
}
