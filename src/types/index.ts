export const POSITIONS = [
  "GK",
  "RB",
  "LB",
  "CB",
  "RWB",
  "LWB",
  "CDM",
  "RM",
  "LM",
  "CM",
  "CAM",
  "RW",
  "LW",
  "CF",
  "ST",
] as const;
export type Position = (typeof POSITIONS)[number];
export type Rarity =
  "common" | "uncommon" | "rare" | "epic" | "legendary" | "galactico";
export type CareerPhase = "youth" | "talent" | "prime" | "decline" | "retired";
export const FIELD_SUBS = [
  "acceleration",
  "sprintSpeed",
  "finishing",
  "shotPower",
  "longShots",
  "volleys",
  "penalties",
  "attackingPositioning",
  "vision",
  "crossing",
  "fkAccuracy",
  "shortPassing",
  "longPassing",
  "curve",
  "agility",
  "balance",
  "reactions",
  "ballControl",
  "dribblingSub",
  "composure",
  "firstTouch",
  "interceptions",
  "headingAccuracy",
  "defensiveAwareness",
  "standingTackle",
  "slidingTackle",
  "jumping",
  "stamina",
  "strength",
  "aggression",
] as const;
export const GK_SUBS = [
  "gkDiving",
  "gkHandling",
  "gkKicking",
  "gkReflexes",
  "gkPositioningSub",
  "gkSprintSpeed",
  "gkAcceleration",
] as const;
export type FieldSub = (typeof FIELD_SUBS)[number];
export type GkSub = (typeof GK_SUBS)[number];
export type SubKey = FieldSub | GkSub;
export type Subs = Partial<Record<SubKey, number>>;
export type FieldStat = "pac" | "sho" | "pas" | "dri" | "def" | "phy";
export type GkStat = "div" | "han" | "kic" | "ref" | "pos" | "spe";
export type Stats<K extends string> = Record<K, number | undefined>;
export interface Attributes extends Stats<FieldStat> {
  div?: number;
  han?: number;
  kic?: number;
  ref?: number;
  pos?: number;
  spe?: number;
  subs: Subs;
}
export interface Player {
  id: string;
  name: string;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  attributes: Attributes;
  traits: string[];
  nationality?: string;
  flagCode?: string;
  rarity?: Rarity;
  careerPhase?: CareerPhase | null;
  playingStyle?: string;
  preferredFoot?: "left" | "right" | "both";
  value?: number;
  wage?: number;
  contractEnd?: string;
  contractDemand?: number;
  fitness?: number;
  morale?: string;
  form?: number[];
  matchesPlayed?: number;
  goals?: number;
  assists?: number;
  cleanSheets?: number;
  injured?: boolean;
  onLoan?: boolean;
  youthProduct?: boolean;
  portraitUrl?: string;
  cardUrl?: string;
  club?: { teamId: string; name?: string; logoUrl?: string; league?: string };
}
export type FitTier = "natural" | "good" | "okay" | "poor";
export interface HistoryEntry {
  day: string;
  age?: number;
  overall?: number;
  potential?: number;
  value?: number;
}
