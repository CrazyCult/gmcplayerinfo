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
      .extend({
        player: playerSummarySchema,
        value: z.number().nullable().optional(),
        posGain: z.number().int().optional().default(0),
        posBest: z.string().nullable().optional(),
      }),
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
    revalidate?: number;
    body?: unknown;
  } = {},
) {
  if (!indexEnabled()) throw new IndexError(503);
  const base =
    process.env.GMC_INDEX_URL ||
    "https://gmc-companion-index.florian-chevalier68.workers.dev";
  let response: Response;
  const started = performance.now();
  const logTiming = (status: number) => {
    if (process.env.GMC_PERF_LOGS !== "1") return;
    // Only the route category: no player/account IDs, query or credentials.
    console.info("GMC_INDEX_TIMING", {
      route: path.split("?")[0].split("/").slice(0, 4).join("/"),
      status,
      durationMs: Math.round(performance.now() - started),
    });
  };
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
        : { next: { revalidate: init.revalidate ?? 900, tags: init.tags } }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    logTiming(0);
    console.error("Index injoignable", path, error);
    throw new IndexError(502);
  }
  if (!response.ok) {
    logTiming(response.status);
    console.error("Index : réponse", response.status, path);
    throw new IndexError(response.status);
  }
  try {
    return await response.json();
  } finally {
    logTiming(response.status);
  }
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
  "posgain",
  "bargain",
] as const;
/** Tris réservés aux comptes autorisés (PREMIUM_ACCOUNT_KEYS). */
export const PREMIUM_SORTS: readonly (typeof CATALOG_SORTS)[number][] = [
  "posgain",
  "bargain",
];
export async function getCatalog({
  q = "",
  position = "",
  page = 1,
  search = false,
  avail = "",
  sort = "overall",
  nat = "",
}: {
  q?: string;
  position?: string;
  page?: number;
  search?: boolean;
  avail?: (typeof CATALOG_AVAIL)[number];
  sort?: (typeof CATALOG_SORTS)[number];
  nat?: string;
} = {}) {
  const params = new URLSearchParams({
    q: q.slice(0, 100),
    position,
    page: String(page),
    avail,
    sort,
  });
  if (nat) params.set("nat", nat.slice(0, 60));
  return catalogSchema.parse(
    await request(`/v1/site/${search ? "search" : "players"}?${params}`),
  );
}

// --- « Mes matchs » : retours de match envoyés par l’extension du manager ---
const pairSchema = z.tuple([z.number(), z.number()]).catch([0, 0]);
const pointSchema = z.object({ t: z.string(), tip: z.string().optional() });
const matchSchema = z.object({
  id: z.string(),
  date: z.number(),
  venue: z.string().nullable().optional(),
  opponent: z.string().nullable().optional(),
  gf: z.number().int(),
  ga: z.number().int(),
  ovrGap: z.number().nullable().optional(),
  formation: z.string().nullable().optional(),
  oppFormation: z.string().nullable().optional(),
  st: z
    .object({
      comp: z.string().optional(),
      xg: pairSchema,
      shots: pairSchema,
      sot: pairSchema,
      big: pairSchema,
      saves: pairSchema,
      poss: pairSchema,
      corners: pairSchema,
      ovr: pairSchema,
      chem: pairSchema,
      subsUsed: pairSchema,
      passPct: z
        .tuple([z.number().nullable(), z.number().nullable()])
        .catch([null, null]),
      en: z.array(z.number()).catch([]),
      shc: z
        .object({ l: z.number(), c: z.number(), r: z.number() })
        .catch({ l: 0, c: 0, r: 0 }),
      gAgainst: z.record(z.string(), z.number()).catch({}),
      set: z.record(z.string(), z.string().nullable()).catch({}),
      oppSet: z.record(z.string(), z.string().nullable()).catch({}),
      players: z
        .array(
          z.object({
            id: z.string(),
            n: z.string(),
            p: z.string(),
            r: z.string().optional(),
            o: z.number(),
            nt: z.number().nullable(),
            g: z.number(),
            a: z.number(),
            f: z.number(),
            w: z.number(),
            l: z.number(),
            sub: z.string().optional(),
          }),
        )
        .catch([]),
    })
    .passthrough(),
  ins: z
    .object({
      verdict: z.string(),
      plus: z.array(pointSchema).catch([]),
      minus: z.array(pointSchema).catch([]),
      best: z.array(z.string()).catch([]),
      worst: z.array(z.string()).catch([]),
    })
    .nullable()
    .catch(null),
});
export type ClubMatch = z.infer<typeof matchSchema>;
const matchesSchema = z.object({
  // Un match illisible ne doit pas masquer les autres.
  matches: z.array(z.unknown()).transform((rows) =>
    rows.flatMap((row) => {
      const parsed = matchSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});
export async function getClubMatches(teamId: string) {
  return matchesSchema.parse(
    await request(`/v1/site/matches/${encodeURIComponent(teamId)}`, {
      tags: [`matches:${teamId}`],
      revalidate: 300,
    }),
  ).matches;
}

const nationalitiesSchema = z.object({
  nationalities: z.array(
    z.object({
      name: z.string(),
      flag: z.string().nullable().optional(),
      n: z.number().int().nonnegative(),
    }),
  ),
});
/** Nationalités présentes dans la base du jeu (liste du filtre, mise en cache 1 h). */
export async function getNationalities() {
  return nationalitiesSchema.parse(
    await request("/v1/site/nationalities", { revalidate: 3600 }),
  ).nationalities;
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
  /** Lu dans le jeu par l’extension du manager : réglages et prêts en cours. */
  extras: z
    .object({
      updatedAt: z.number(),
      coaches: z
        .object({
          att: z.number().int().min(1).max(5),
          mid: z.number().int().min(1).max(5),
          def: z.number().int().min(1).max(5),
          gk: z.number().int().min(1).max(5),
          physio: z.number().int().min(1).max(5),
        })
        .nullable(),
      center: z.number().int().min(1).max(5).nullable(),
      loans: z.array(
        z.object({
          id: z.string(),
          until: z.number(),
          lender: z.string().nullable(),
        }),
      ),
      /** Composition du jeu : le 11 et le banc. */
      lineup: z
        .object({ xi: z.array(z.string()), bench: z.array(z.string()) })
        .nullable()
        .optional()
        .catch(null),
      /** Rareté de chaque joueur, lue dans l’effectif du manager. */
      rarities: z
        .record(z.string(), z.string())
        .nullable()
        .optional()
        .catch(null),
    })
    .nullable()
    .optional()
    .catch(null),
});
export type ClubSquad = z.infer<typeof clubSchema>;
export const clubTag = (teamId: string) => `club:${teamId}`.slice(0, 256);
/** Priority refresh of the whole club, also usable without a local extension. */
export async function requestClub(teamId: string) {
  return z
    .object({
      teamId: z.string(),
      requestedAt: z.number(),
      fetchedAt: z.number().nullable(),
      status: z.string(),
    })
    .parse(
      await request(`/v1/site/club/${encodeURIComponent(teamId)}`, {
        method: "POST",
      }),
    );
}
/** Brief navigation cache; an explicit Companion refresh always bypasses it. */
export async function getClub(
  teamId: string,
  { fresh = false }: { fresh?: boolean } = {},
) {
  const parsed = clubSchema.safeParse(
    await request(`/v1/site/club/${encodeURIComponent(teamId)}`, {
      fresh,
      revalidate: 30,
      tags: [clubTag(teamId)],
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

const appearanceSchema = z.object({
  appearance: z.enum(["light", "dark", "manga"]).nullable(),
});
export async function getAccountAppearance(key: string) {
  return appearanceSchema.parse(
    await request(`/v1/site/preferences/${encodeURIComponent(key)}`, {
      fresh: true,
    }),
  ).appearance;
}
export async function setAccountAppearance(
  key: string,
  appearance: "light" | "dark" | "manga" | null,
) {
  return appearanceSchema.parse(
    await request(`/v1/site/preferences/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { appearance },
    }),
  ).appearance;
}
