import type { FieldStat, GkStat, Position, SubKey } from "../types";

export const FIELD_GROUPS: Record<FieldStat, readonly SubKey[]> = {
  pac: ["acceleration", "sprintSpeed"],
  sho: [
    "finishing",
    "shotPower",
    "longShots",
    "volleys",
    "penalties",
    "attackingPositioning",
  ],
  pas: [
    "vision",
    "crossing",
    "fkAccuracy",
    "shortPassing",
    "longPassing",
    "curve",
  ],
  dri: [
    "agility",
    "balance",
    "reactions",
    "ballControl",
    "dribblingSub",
    "composure",
  ],
  def: [
    "interceptions",
    "headingAccuracy",
    "defensiveAwareness",
    "standingTackle",
    "slidingTackle",
  ],
  phy: ["jumping", "stamina", "strength", "aggression"],
};
export const GK_GROUPS: Record<GkStat, readonly SubKey[]> = {
  div: ["gkDiving"],
  han: ["gkHandling"],
  kic: ["gkKicking"],
  ref: ["gkReflexes"],
  pos: ["gkPositioningSub"],
  spe: ["gkSprintSpeed", "gkAcceleration"],
};
// Poids de chaque stat dans l'OVR, par poste (manuel du jeu, « How OVR is
// worked out », 30/10/2026), ramenés à 100 : OVR = Σ poids × stat / 100.
// Manuel : ST 2,5/3/1/2/0,3/1,2 · LW-RW 3/2/1,5/3/0,5/0,7 · CAM 1,5/2/3/2,5/1/1
// · CM 1,5/1,5/3/2/2/1,5 · CDM 1/0,5/2,5/1/3/2 · LB-RB 2,5/0,5/1,5/1,5/2,5/1,5
// · CB 1/0,3/1,2/0,5/3,5/3 · LM-RM 2,5/1,5/2/2,5/1/1 · LWB-RWB 3/0,5/2/2/2/1,5.
// Vérifié : OVR exact pour 38 joueurs sur 38 (aperçus du 22/10/2026).
const per100 = (w: readonly number[]) => {
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x * 100) / sum);
};
export const WEIGHTS = {
  CB: per100([1, 0.3, 1.2, 0.5, 3.5, 3]),
  FB: per100([2.5, 0.5, 1.5, 1.5, 2.5, 1.5]),
  WB: per100([3, 0.5, 2, 2, 2, 1.5]),
  CDM: per100([1, 0.5, 2.5, 1, 3, 2]),
  CM: per100([1.5, 1.5, 3, 2, 2, 1.5]),
  CAM: per100([1.5, 2, 3, 2.5, 1, 1]),
  WM: per100([2.5, 1.5, 2, 2.5, 1, 1]),
  W: per100([3, 2, 1.5, 3, 0.5, 0.7]),
  ST: per100([2.5, 3, 1, 2, 0.3, 1.2]),
} as const;
export type Family = keyof typeof WEIGHTS | "GK";
export const FAMILIES: Record<Position, Family> = {
  GK: "GK",
  CB: "CB",
  RB: "FB",
  LB: "FB",
  RWB: "WB",
  LWB: "WB",
  CDM: "CDM",
  CM: "CM",
  CAM: "CAM",
  RM: "WM",
  LM: "WM",
  RW: "W",
  LW: "W",
  ST: "ST",
};
export const GOOD_PAIRS: readonly (readonly Position[])[] = [
  ["LB", "LWB"],
  ["RB", "RWB"],
  ["CDM", "CM"],
  ["CM", "CAM"],
  ["LM", "LW"],
  ["RM", "RW"],
  ["CAM", "ST"],
];
// Manuel du jeu : « a one-step neighbour (a CB at CDM, an LM at CM) at 90 ».
export const OKAY_PAIRS: readonly (readonly Position[])[] = [
  ["CB", "CDM"],
  ["LM", "CM"],
  ["RM", "CM"],
  ["LW", "RW"],
  ["LM", "RM"],
];
export const MENTAL: readonly SubKey[] = ["vision", "composure", "aggression"];
export type Coach = "att" | "mid" | "def" | "gk" | "physio";
export type CoachLevels = Record<Coach, number>;
export const DEFAULT_COACHES: CoachLevels = {
  att: 1,
  mid: 1,
  def: 1,
  gk: 1,
  physio: 1,
};
export const MAX_COACHES: CoachLevels = {
  att: 5,
  mid: 5,
  def: 5,
  gk: 5,
  physio: 5,
};
export const COACHES: Record<
  Coach,
  {
    positions: readonly Position[] | "all";
    exercises: Partial<Record<SubKey, number>>;
  }
> = {
  att: {
    positions: ["LW", "RW", "ST"],
    exercises: {
      finishing: 1,
      attackingPositioning: 1,
      shotPower: 2,
      penalties: 2,
      volleys: 3,
      longShots: 3,
      ballControl: 1,
      dribblingSub: 2,
      composure: 4,
      shortPassing: 2,
      longPassing: 3,
      curve: 4,
      vision: 5,
      headingAccuracy: 4,
    },
  },
  mid: {
    positions: ["CDM", "CM", "CAM", "LM", "RM"],
    exercises: {
      shortPassing: 1,
      longPassing: 2,
      crossing: 2,
      curve: 3,
      fkAccuracy: 4,
      vision: 2,
      ballControl: 1,
      dribblingSub: 2,
      composure: 3,
      longShots: 3,
      finishing: 4,
      shotPower: 4,
      volleys: 5,
      penalties: 5,
      standingTackle: 2,
      interceptions: 3,
      defensiveAwareness: 4,
      headingAccuracy: 5,
    },
  },
  def: {
    positions: ["LB", "CB", "RB", "LWB", "RWB"],
    exercises: {
      standingTackle: 1,
      defensiveAwareness: 1,
      interceptions: 2,
      slidingTackle: 3,
      headingAccuracy: 3,
      strength: 2,
      aggression: 3,
      reactions: 4,
      shortPassing: 2,
      longPassing: 3,
      crossing: 4,
      ballControl: 3,
      dribblingSub: 5,
      composure: 4,
    },
  },
  gk: {
    positions: ["GK"],
    exercises: {
      gkDiving: 1,
      gkHandling: 1,
      gkPositioningSub: 2,
      gkKicking: 2,
      gkReflexes: 3,
      reactions: 3,
      jumping: 4,
      strength: 4,
      gkAcceleration: 5,
      gkSprintSpeed: 5,
      balance: 5,
    },
  },
  physio: {
    positions: "all",
    exercises: {
      stamina: 1,
      acceleration: 2,
      sprintSpeed: 2,
      agility: 3,
      balance: 3,
      jumping: 4,
      strength: 4,
      reactions: 5,
      aggression: 5,
    },
  },
};
const names: Partial<Record<SubKey, string>> = {
  finishing: "Finishing Drills",
  shotPower: "Power Shot Training",
  longShots: "Long Range Shooting",
  volleys: "Volley Practice",
  penalties: "Penalty Kick Practice",
  attackingPositioning: "Attacking Positioning",
  shortPassing: "Short Passing",
  longPassing: "Long Ball Drills",
  crossing: "Crossing Accuracy",
  fkAccuracy: "Free Kick Precision",
  curve: "Curve & Swerve Training",
  dribblingSub: "Dribbling Drills",
  ballControl: "First Touch Training",
  standingTackle: "Standing Tackle Drills",
  slidingTackle: "Sliding Tackle Practice",
  interceptions: "Reading the Game",
  headingAccuracy: "Heading Practice",
  defensiveAwareness: "Defensive Awareness",
  acceleration: "Acceleration Sprints",
  sprintSpeed: "Top Speed Training",
  stamina: "Endurance Run",
  strength: "Strength & Conditioning",
  jumping: "Jump Training",
  agility: "Agility Drills",
  balance: "Balance & Core Work",
  reactions: "Reaction Speed Drills",
  vision: "Vision & Awareness",
  composure: "Composure Under Pressure",
  aggression: "Controlled Aggression",
  gkDiving: "Diving Practice",
  gkHandling: "Handling Drills",
  gkKicking: "Kicking Improvement",
  gkPositioningSub: "Positioning Mastery",
  gkReflexes: "Goalkeeper Reflexes",
  gkAcceleration: "Goalkeeper Acceleration",
  gkSprintSpeed: "Goalkeeper Top Speed",
};
const physical: readonly SubKey[] = [
  "acceleration",
  "sprintSpeed",
  "stamina",
  "strength",
  "jumping",
  "agility",
  "balance",
  "reactions",
  "gkAcceleration",
  "gkSprintSpeed",
];
export interface Exercise {
  key: SubKey;
  name: string;
  base: number;
  minutes: number;
}
export const EXERCISES: Exercise[] = Object.entries(names).map(
  ([key, name]) => {
    const sub = key as SubKey;
    return {
      key: sub,
      name,
      base: MENTAL.includes(sub) ? 4000 : physical.includes(sub) ? 9000 : 5000,
      minutes: MENTAL.includes(sub) ? 45 : physical.includes(sub) ? 120 : 60,
    };
  },
);
