import { z } from "zod";
import { parseSquad } from "@/schemas/player";
import { FIELD_SUBS, GK_SUBS, type Player } from "@/types";
const slot = z.object({
  playerId: z.string().nullable().optional(),
  position: z.string().optional(),
  role: z.string().nullable().optional(),
});
const tacticKeys = [
  "formation",
  "playstyle",
  "pressingStyle",
  "defensiveLine",
  "aggressivity",
  "tempo",
  "mentality",
  "width",
  "cornerRoutine",
  "freeKickRoutine",
  "throwInRoutine",
  "captainPlayerId",
  "setPieceTakers",
  "slotRoles",
  "emptySlots",
  "lineupComplete",
] as const;
export type TacticsExport = {
  lineup: z.infer<typeof slot>[];
  substitutes: z.infer<typeof slot>[];
} & Partial<Record<(typeof tacticKeys)[number], unknown>>;
export interface SquadExportData {
  version: 2;
  collectedAt: string | null;
  source: string;
  tactics: TacticsExport | null;
  players: Player[];
  clubSync?: { teamId: string; fetchedAt: number };
}
export function parseSquadExport(raw: unknown): SquadExportData {
  const envelope = z
    .object({
      version: z.union([z.literal(1), z.literal(2)]),
      collectedAt: z.string().datetime().nullable(),
      players: z.array(z.unknown()).min(1).max(100),
      tactics: z.record(z.string(), z.unknown()).nullable(),
      clubSync: z
        .object({
          teamId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
          fetchedAt: z.number().int().positive(),
        })
        .optional(),
    })
    .parse(raw);
  const { players } = parseSquad(envelope.players);
  let tactics: TacticsExport | null = null;
  if (envelope.tactics) {
    const slots = z
      .object({
        lineup: z.array(slot).max(11),
        substitutes: z.array(slot).max(20),
      })
      .parse(envelope.tactics);
    const ids = [...slots.lineup, ...slots.substitutes].flatMap((s) =>
      s.playerId ? [s.playerId] : [],
    );
    if (new Set(ids).size !== ids.length)
      throw new Error("Un joueur apparaît plusieurs fois dans la composition.");
    if (ids.some((id) => !players.some((p) => p.id === id)))
      throw new Error("Un joueur de la composition manque dans l’export.");
    tactics = {
      ...Object.fromEntries(
        tacticKeys
          .filter((k) => envelope.tactics![k] !== undefined)
          .map((k) => [k, envelope.tactics![k]]),
      ),
      ...slots,
    };
  }
  return {
    version: 2,
    collectedAt: envelope.collectedAt,
    source: "import-gamechase",
    players,
    tactics,
    ...(envelope.clubSync ? { clubSync: envelope.clubSync } : {}),
  };
}
const stats = [
  "pac",
  "sho",
  "pas",
  "dri",
  "def",
  "phy",
  "div",
  "han",
  "kic",
  "ref",
  "pos",
  "spe",
] as const;
export function squadCsv(data: SquadExportData) {
  const headers = [
    "id",
    "nom",
    "groupe",
    "ordre",
    "poste_composition",
    "role",
    "formation",
    "poste",
    "age",
    "ovr",
    "potentiel",
    "nationalite",
    "pied",
    "style",
    "traits",
    "forme_physique",
    "moral",
    "forme",
    "blesse",
    "en_pret",
    "matchs_joues",
    "buts",
    "passes_decisives",
    "clean_sheets",
    "date_collecte",
    ...stats,
    ...FIELD_SUBS,
    ...GK_SUBS,
  ];
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = data.players.map((p) => {
    const xi = data.tactics?.lineup.findIndex((s) => s.playerId === p.id) ?? -1;
    const bench =
      data.tactics?.substitutes.findIndex((s) => s.playerId === p.id) ?? -1;
    const selected =
      xi >= 0
        ? data.tactics!.lineup[xi]
        : bench >= 0
          ? data.tactics!.substitutes[bench]
          : null;
    return [
      p.id,
      p.name,
      !data.tactics
        ? "inconnu"
        : xi >= 0
          ? "titulaire"
          : bench >= 0
            ? "banc"
            : "reserve",
      xi >= 0 ? xi + 1 : bench >= 0 ? bench + 1 : null,
      selected?.position,
      selected?.role,
      data.tactics?.formation,
      p.position,
      p.age,
      p.overall,
      p.potential,
      p.nationality,
      p.preferredFoot,
      p.playingStyle,
      p.traits.join(" | "),
      p.fitness,
      p.morale,
      p.form?.join(" | "),
      p.injured,
      p.onLoan,
      p.matchesPlayed,
      p.goals,
      p.assists,
      p.cleanSheets,
      data.collectedAt,
      ...stats.map((k) => p.attributes[k]),
      ...FIELD_SUBS.map((k) => p.attributes.subs[k]),
      ...GK_SUBS.map((k) => p.attributes.subs[k]),
    ]
      .map(cell)
      .join(";");
  });
  return "\uFEFF" + [headers.map(cell).join(";"), ...rows].join("\r\n");
}
