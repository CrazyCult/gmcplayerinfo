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
  /** Historique d'OVR brut du jeu (format lu par parseOverallHistory). */
  history: z.unknown().optional(),
  /** Club actuel (nom connu par la base du jeu), ou agent libre. */
  club: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      freeAgent: z.boolean(),
      crest: z.string().url().nullable().optional(),
    })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type CurrentClub = NonNullable<z.infer<typeof snapshotSchema>["club"]>;
const catalogSchema = z.object({
  players: z.array(
    snapshotSchema
      .pick({ fetchedAt: true, teamId: true, light: true, market: true })
      .extend({ player: playerSummarySchema }),
  ),
  total: z.number().int().nonnegative(),
  /** Plus de résultats que le décompte affiché (décompte plafonné par l’index). */
  capped: z.boolean().default(false),
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
async function request(
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT";
    tags?: string[];
    fresh?: boolean;
    body?: unknown;
  } = {},
) {
  if (!indexEnabled()) throw new IndexError(503);
  const base =
    process.env.GMC_INDEX_URL ||
    "https://gmc-companion-index.florian-chevalier68.workers.dev";
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${process.env.GMC_SITE_TOKEN}`,
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.fresh || (init.method && init.method !== "GET")
        ? { cache: "no-store" as const }
        : { next: { revalidate: 900, tags: init.tags } }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("Index injoignable", path, error);
    throw new IndexError(502);
  }
  if (!response.ok) {
    console.error("Index : réponse", response.status, path);
    throw new IndexError(response.status);
  }
  return response.json();
}
export const playerTag = (id: string) => `player:${id}`.slice(0, 256);
export const getPlayer = cache(async (id: string) => {
  const raw = await request(`/v1/site/player/${encodeURIComponent(id)}`, {
    tags: [playerTag(id)],
  });
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Fiche joueur invalide", id, parsed.error.issues.slice(0, 5));
    throw new IndexError(422);
  }
  return parsed.data;
});
const fullStatusSchema = z.object({
  light: z.boolean(),
  fetchedAt: z.number().nullable().optional(),
  requestedAt: z.number().nullable().optional(),
  status: z.string().optional(),
});
export type FullStatus = z.infer<typeof fullStatusSchema>;
/** État en direct (sans cache) : fiche toujours légère ? club demandé ? */
export async function getFullStatus(id: string) {
  return fullStatusSchema.parse(
    await request(`/v1/site/status/${encodeURIComponent(id)}`, { fresh: true }),
  );
}
/** Demande aux extensions GMC Companion de lire le club en priorité. */
export async function requestFull(id: string) {
  return fullStatusSchema.parse(
    await request(`/v1/site/request/${encodeURIComponent(id)}`, {
      method: "POST",
    }),
  );
}
export const CATALOG_AVAIL = ["", "transfer", "loan", "free", "full"] as const;
export const CATALOG_SORTS = [
  "overall",
  "potential",
  "gap",
  "price",
  "loan",
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

// --- « Mon effectif » -------------------------------------------------------
const clubSearchSchema = z.object({
  clubs: z.array(
    z.object({
      teamId: z.string(),
      name: z.string(),
      fetchedAt: z.number().nullable(),
    }),
  ),
});
export type ClubHit = z.infer<typeof clubSearchSchema>["clubs"][number];
export async function searchClubs(q: string) {
  const params = new URLSearchParams({ q: q.slice(0, 60) });
  return clubSearchSchema.parse(
    await request(`/v1/site/clubs?${params}`, { fresh: true }),
  ).clubs;
}
const clubSchema = z.object({
  teamId: z.string(),
  name: z.string().nullable(),
  crest: z.string().url().nullable().optional(),
  fetchedAt: z.number().nullable(),
  requestedAt: z.number().nullable(),
  players: z.array(z.object({ player: playerSchema, light: z.boolean() })),
});
export type ClubSquad = z.infer<typeof clubSchema>;
/** Effectif d’un club (sans cache : l’instantané peut arriver à tout moment). */
export async function getClub(teamId: string) {
  const parsed = clubSchema.safeParse(
    await request(`/v1/site/club/${encodeURIComponent(teamId)}`, {
      fresh: true,
    }),
  );
  if (!parsed.success) {
    console.error("Effectif invalide", teamId, parsed.error.issues.slice(0, 5));
    throw new IndexError(422);
  }
  return parsed.data;
}
const meSchema = z.object({ teamId: z.string().nullable() });
/** Club rattaché à un compte (clé = empreinte du compte Google). */
export async function getAccountClub(key: string) {
  return meSchema.parse(
    await request(`/v1/site/me/${encodeURIComponent(key)}`, { fresh: true }),
  ).teamId;
}
export async function setAccountClub(key: string, teamId: string | null) {
  return meSchema.parse(
    await request(`/v1/site/me/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { teamId },
    }),
  ).teamId;
}
