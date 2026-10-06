import { z } from "zod";
import {
  FIELD_SUBS,
  GK_SUBS,
  POSITIONS,
  type Attributes,
  type FieldStat,
  type GkStat,
  type Player,
  type Subs,
} from "../types";

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const optionalNumber = z
  .number()
  .finite()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined);
const optionalBoolean = z
  .boolean()
  .nullish()
  .transform((value) => value ?? undefined);
const attributeValue = z
  .number()
  .finite()
  .min(0)
  .max(150)
  .nullish()
  .transform((value) => value ?? undefined);
const statKeys: readonly (FieldStat | GkStat)[] = [
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
];
const allSubs = [...FIELD_SUBS, ...GK_SUBS];

export const attributesSchema = z
  .record(z.string(), z.unknown())
  .transform((raw, context): Attributes => {
    let source = raw;
    if (raw.subs !== undefined) {
      const nested = z.record(z.string(), z.unknown()).safeParse(raw.subs);
      if (!nested.success) {
        context.addIssue({
          code: "custom",
          message: "Sous-attributs invalides",
          path: ["subs"],
        });
        return z.NEVER;
      }
      source = nested.data;
    }
    const result: Attributes = {
      pac: undefined,
      sho: undefined,
      pas: undefined,
      dri: undefined,
      def: undefined,
      phy: undefined,
      subs: {},
    };
    for (const key of statKeys) {
      const parsed = attributeValue.safeParse(raw[key]);
      if (!parsed.success)
        context.addIssue({
          code: "custom",
          message: `Stat ${key} invalide`,
          path: [key],
        });
      else result[key] = parsed.data;
    }
    for (const key of allSubs) {
      const parsed = attributeValue.safeParse(source[key]);
      if (!parsed.success)
        context.addIssue({
          code: "custom",
          message: `Sous-attribut ${key} invalide`,
          path: [key],
        });
      else if (parsed.data !== undefined) result.subs[key] = parsed.data;
    }
    return result;
  });

/** Le dataset anonymisé utilise ce schéma sans inventer une identité de joueur. */
export const calculationPlayerSchema = z.object({
  position: z.enum(POSITIONS),
  age: z.number().int().min(10).max(60),
  overall: z.number().int().min(1).max(150),
  potential: z.number().int().min(1).max(150),
  attributes: attributesSchema,
});
const formSchema = z
  .union([
    z.number().finite(),
    z.array(
      z.union([
        z.number().finite(),
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ]),
    ),
  ])
  .nullish()
  .transform((value) =>
    value == null ? undefined : typeof value === "number" ? [value] : value,
  );

const rawPlayerSchema = calculationPlayerSchema.extend({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  nationality: optionalText,
  flagCode: optionalText,
  flag_code: optionalText,
  rarity: z
    .enum(["common", "uncommon", "rare", "epic", "legendary", "galactico"])
    .nullish(),
  careerPhase: z
    .enum(["youth", "talent", "prime", "decline", "retired"])
    .nullish(),
  career_phase: z
    .enum(["youth", "talent", "prime", "decline", "retired"])
    .nullish(),
  traits: z.array(z.string()).nullish(),
  playingStyle: optionalText,
  playing_style: optionalText,
  preferredFoot: optionalText,
  preferred_foot: optionalText,
  value: optionalNumber,
  wage: optionalNumber,
  salary: optionalNumber,
  contractEnd: optionalText,
  contract_end: optionalText,
  contract: z.object({ end: optionalText }).nullish(),
  contractDemand: optionalNumber,
  contract_demand_gmc2: optionalNumber,
  fitness: z.number().min(0).max(100).nullish(),
  morale: optionalText,
  form: formSchema,
  matchesPlayed: optionalNumber,
  matches_played: optionalNumber,
  goals: optionalNumber,
  assists: optionalNumber,
  cleanSheets: optionalNumber,
  clean_sheets: optionalNumber,
  injured: optionalBoolean,
  onLoan: optionalBoolean,
  active_loan: z
    .union([z.boolean(), z.record(z.string(), z.unknown())])
    .nullish(),
  youthProduct: optionalBoolean,
  is_youth_product: optionalBoolean,
  portraitUrl: optionalText,
  portrait_url: optionalText,
  cardUrl: optionalText,
  card_url: optionalText,
  club_id: optionalText,
  club: z
    .object({
      teamId: z.string(),
      name: optionalText,
      logoUrl: optionalText,
      league: optionalText,
    })
    .nullish(),
});

export const playerSchema = rawPlayerSchema.transform((raw): Player => {
  const foot = (raw.preferredFoot ?? raw.preferred_foot)?.toLowerCase();
  return {
    id: raw.id,
    name: raw.name,
    position: raw.position,
    age: raw.age,
    overall: raw.overall,
    potential: raw.potential,
    attributes: raw.attributes,
    traits: raw.traits ?? [],
    nationality: raw.nationality,
    flagCode: raw.flagCode ?? raw.flag_code,
    rarity: raw.rarity ?? undefined,
    careerPhase: raw.careerPhase ?? raw.career_phase ?? undefined,
    playingStyle: raw.playingStyle ?? raw.playing_style,
    preferredFoot:
      foot === "left" || foot === "right" || foot === "both" ? foot : undefined,
    value: raw.value,
    wage: raw.wage ?? raw.salary,
    contractEnd: raw.contractEnd ?? raw.contract_end ?? raw.contract?.end,
    contractDemand: raw.contractDemand ?? raw.contract_demand_gmc2,
    fitness: raw.fitness ?? undefined,
    morale: raw.morale,
    form: raw.form,
    matchesPlayed: raw.matchesPlayed ?? raw.matches_played,
    goals: raw.goals,
    assists: raw.assists,
    cleanSheets: raw.cleanSheets ?? raw.clean_sheets,
    injured: raw.injured,
    onLoan:
      raw.onLoan ??
      (raw.active_loan == null ? undefined : Boolean(raw.active_loan)),
    youthProduct: raw.youthProduct ?? raw.is_youth_product,
    portraitUrl: raw.portraitUrl ?? raw.portrait_url,
    cardUrl: raw.cardUrl ?? raw.card_url,
    club: raw.club ?? (raw.club_id ? { teamId: raw.club_id } : undefined),
  };
});

export interface ImportWarning {
  id: string;
  missing: (keyof Subs)[];
  message: string;
}
const squadSchema = z.union([
  z.array(playerSchema).min(1),
  z
    .object({ players: z.array(playerSchema).min(1) })
    .transform((raw) => raw.players),
  z
    .object({ data: z.object({ players: z.array(playerSchema).min(1) }) })
    .transform((raw) => raw.data.players),
]);
export function parseSquad(input: unknown): {
  players: Player[];
  warnings: ImportWarning[];
} {
  const players = squadSchema.parse(input);
  const ids = new Set<string>();
  const warnings: ImportWarning[] = [];
  for (const player of players) {
    if (ids.has(player.id))
      throw new Error(`Identifiant joueur dupliqué : ${player.id}`);
    ids.add(player.id);
    const required = player.position === "GK" ? GK_SUBS : FIELD_SUBS;
    const missing = required.filter(
      (key) => player.attributes.subs[key] === undefined,
    );
    if (missing.length)
      warnings.push({
        id: player.id,
        missing,
        message: `${player.name} : ${missing.length} sous-attribut(s) manquant(s), calculs incomplets.`,
      });
  }
  return { players, warnings };
}
