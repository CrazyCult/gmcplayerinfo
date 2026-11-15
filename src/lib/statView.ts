import {
  EXERCISES,
  FIELD_GROUPS,
  GK_GROUPS,
  MAX_COACHES,
  type Coach,
  type CoachLevels,
} from "@/engine/tables";
import { exerciseAccess } from "@/engine/training";
import type { FieldStat, GkStat, Player, Position, SubKey } from "@/types";

/**
 * Vue « Stats » de l’effectif : les 6 stats de chaque joueur, ses points
 * faibles et forts, ses sous-attributs et l’exercice du jeu qui fait monter
 * chacun d’eux.
 *
 * Une stat est « clé » quand elle compte pour le poste du joueur. Une stat clé
 * est faible sous l’OVR du joueur moins GAP, forte à partir de l’OVR plus GAP.
 */
export const GAP = 6;
export const FIELD_STATS: FieldStat[] = [
  "pac",
  "sho",
  "pas",
  "dri",
  "def",
  "phy",
];
export const GK_STATS: GkStat[] = ["div", "han", "kic", "ref", "pos", "spe"];
export type AnyStat = FieldStat | GkStat;
export const STAT_SHORT: Record<AnyStat, string> = {
  pac: "PAC",
  sho: "SHO",
  pas: "PAS",
  dri: "DRI",
  def: "DEF",
  phy: "PHY",
  div: "DIV",
  han: "HAN",
  kic: "KIC",
  ref: "REF",
  pos: "POS",
  spe: "SPE",
};
const KEY: Partial<Record<Position, AnyStat[]>> = {
  GK: ["div", "han", "ref", "pos"],
  LB: ["pac", "def", "pas"],
  RB: ["pac", "def", "pas"],
  LWB: ["pac", "def", "pas"],
  RWB: ["pac", "def", "pas"],
  CB: ["def", "phy", "pac"],
  CDM: ["def", "pas", "phy"],
  CM: ["pas", "dri", "def"],
  LM: ["pac", "dri", "pas"],
  RM: ["pac", "dri", "pas"],
  CAM: ["pas", "dri", "sho"],
  LW: ["pac", "dri", "sho"],
  RW: ["pac", "dri", "sho"],
  ST: ["sho", "pac", "phy"],
};
export type Kind = "weak" | "strong" | "key" | "minor";

export const statsOf = (player: Player): AnyStat[] =>
  player.position === "GK" ? GK_STATS : FIELD_STATS;
export const statValue = (player: Player, stat: AnyStat) =>
  (player.attributes as unknown as Record<string, number | undefined>)[stat];
export const isKeyStat = (player: Player, stat: AnyStat) =>
  Boolean(KEY[player.position]?.includes(stat));

export function kindOf(
  player: Player,
  value: number | undefined,
  key: boolean,
): Kind {
  if (value == null || !key) return "minor";
  if (value < player.overall - GAP) return "weak";
  if (value >= player.overall + GAP) return "strong";
  return "key";
}
export const statKind = (player: Player, stat: AnyStat) =>
  kindOf(player, statValue(player, stat), isKeyStat(player, stat));

export const subsOf = (stat: AnyStat): readonly SubKey[] =>
  (FIELD_GROUPS as Record<string, readonly SubKey[]>)[stat] ??
  (GK_GROUPS as Record<string, readonly SubKey[]>)[stat] ??
  [];
/** Un sous-attribut est marqué selon sa stat : clé pour le poste ou non. */
export const subKind = (player: Player, stat: AnyStat, sub: SubKey) =>
  kindOf(player, player.attributes.subs?.[sub], isKeyStat(player, stat));

export const COACH_INFO: Record<Coach, { label: string; color: string }> = {
  att: { label: "Coach offensif", color: "#ff8a5b" },
  mid: { label: "Coach du milieu", color: "#4ade80" },
  def: { label: "Coach défensif", color: "#38bdf8" },
  gk: { label: "Coach des gardiens", color: "#facc15" },
  physio: { label: "Physio", color: "#c084fc" },
};
const NAME = new Map(EXERCISES.map((e) => [e.key, e.name]));

export interface ExerciseInfo {
  name: string;
  coaches: {
    coach: Coach;
    label: string;
    color: string;
    level: number;
    /** null : niveaux du club inconnus. */
    locked: boolean | null;
  }[];
}
/** Exercice du jeu pour ce sous-attribut, chez les coachs qui entraînent ce poste. */
export function exerciseFor(
  position: Position,
  sub: SubKey,
  coaches?: CoachLevels | null,
): ExerciseInfo {
  const access = exerciseAccess(position, sub, coaches ?? MAX_COACHES).sort(
    (a, b) => a.level - b.level,
  );
  return {
    name: NAME.get(sub) ?? sub,
    coaches: access.map((a) => ({
      coach: a.coach,
      label: COACH_INFO[a.coach].label,
      color: COACH_INFO[a.coach].color,
      level: a.level,
      locked: coaches ? !a.available : null,
    })),
  };
}
