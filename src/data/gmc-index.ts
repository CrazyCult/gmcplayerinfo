import "server-only";
import { cache } from "react";
import { z } from "zod";
import { playerSchema } from "@/schemas/player";
import { playerSummarySchema } from "@/schemas/index";

export const indexEnabled = () => Boolean(process.env.GMC_SITE_TOKEN);
const marketSchema = z
  .object({
    transferPrice: z.number().finite().nullable(),
    loanFee: z.number().finite().nullable(),
    freeAgent: z.boolean(),
    clubName: z.string().nullable(),
    seenAt: z.number().finite().nullable().optional(),
  })
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const priceSchema = z.object({
  kind: z.enum(["transfer", "loan"]),
  price: z.number().finite().nonnegative(),
  overall: z.number().nullable(),
  potential: z.number().nullable().optional(),
  age: z.number().nullable(),
  first_seen: z.number().finite().optional(),
  last_seen: z.number().finite(),
});
export type MarketInfo = z.infer<typeof marketSchema>;
export type PriceObservation = z.infer<typeof priceSchema>;
const snapshotSchema = z.object({
  player: playerSchema,
  fetchedAt: z.number().finite(),
  teamId: z.string(),
  /** Fiche légère : joueur connu par la base du jeu seulement (6 stats). */
  light: z.boolean().default(false),
  market: marketSchema,
  prices: z.array(priceSchema).default([]),
  comparables: z.array(priceSchema).default([]),
});
const catalogSchema = z.object({
  players: z.array(
    snapshotSchema
      .pick({ fetchedAt: true, teamId: true, light: true, market: true })
      .extend({ player: playerSummarySchema }),
  ),
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
export const CATALOG_AVAIL = ["", "transfer", "loan", "free", "full"] as const;
export const CATALOG_SORTS = [
  "overall",
  "potential",
  "gap",
  "price",
  "loan",
  "age",
] as const;
export async function getCatalog({
  q = "",
  position = "",
  page = 1,
  search = false,
  avail = "",
  sort = "overall",
}: {
  q?: string;
  position?: string;
  page?: number;
  search?: boolean;
  avail?: (typeof CATALOG_AVAIL)[number];
  sort?: (typeof CATALOG_SORTS)[number];
} = {}) {
  const params = new URLSearchParams({
    q: q.slice(0, 100),
    position,
    page: String(page),
    avail,
    sort,
  });
  return catalogSchema.parse(
    await request(`/v1/site/${search ? "search" : "players"}?${params}`),
  );
}
