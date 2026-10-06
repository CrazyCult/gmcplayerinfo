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
export const WEIGHTS = {
  CB: [11, 3, 13, 4, 37, 32],
  FB: [25, 5, 15, 15, 25, 15],
  CDM: [10, 5, 25, 10, 30, 20],
  CM: [13, 13, 27, 17, 17, 13],
  CAM: [13, 18, 27, 24, 9, 9],
  WM: [24, 13, 20, 24, 10, 9],
  W: [28, 19, 14, 28, 5, 6],
  ST: [25, 30, 10, 20, 3, 12],
} as const;
export type Family = keyof typeof WEIGHTS | "GK";
export const FAMILIES: Record<Position, Family> = {
  GK: "GK",
  CB: "CB",
  RB: "FB",
  LB: "FB",
  RWB: "FB",
  LWB: "FB",
  CDM: "CDM",
  CM: "CM",
  CAM: "CAM",
  RM: "WM",
  LM: "WM",
  RW: "W",
  LW: "W",
  CF: "ST",
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
  ["CF", "ST"],
];
export const OKAY_PAIRS: readonly (readonly Position[])[] = [
  ["CB", "CDM"],
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
