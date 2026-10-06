import type { Player, Position, SubKey, Subs } from "../types";
import {
  COACHES,
  DEFAULT_COACHES,
  EXERCISES,
  MENTAL,
  type Coach,
  type CoachLevels,
} from "./tables";
import { modelOvr } from "./ovr";

export function validateSettings(
  coaches: CoachLevels,
  center: number,
  age: number,
): void {
  if (!Number.isInteger(center) || center < 1 || center > 5)
    throw new RangeError("Centre : niveau 1 à 5");
  if (!Number.isInteger(age) || age < 0) throw new RangeError("Âge invalide");
  if (
    Object.values(coaches).some(
      (level) => !Number.isInteger(level) || level < 1 || level > 5,
    )
  )
    throw new RangeError("Coachs : niveau 1 à 5");
}
export function sessionGain(age: number, key: SubKey): number {
  if (age >= 31) return MENTAL.includes(key) ? 2 : 0;
  return age < 18 ? 6 : age <= 24 ? 4 : 2;
}
export const priceMultiplier = (ovr: number): number =>
  ovr >= 96 ? 25 : ovr >= 91 ? 10 : ovr >= 86 ? 4 : ovr >= 81 ? 2 : 1;
export const successRate = (center: number): number =>
  Math.min(1, 0.8 * (1 + 0.05 * center));
export function exerciseAccess(
  position: Position,
  key: SubKey,
  levels: CoachLevels = DEFAULT_COACHES,
) {
  if (
    position === "GK" &&
    ["acceleration", "sprintSpeed", "agility"].includes(key)
  )
    return [];
  return (Object.keys(COACHES) as Coach[]).flatMap((coach) => {
    const definition = COACHES[coach];
    const level = definition.exercises[key];
    if (
      level === undefined ||
      (definition.positions !== "all" &&
        !definition.positions.includes(position))
    )
      return [];
    return [{ coach, level, available: levels[coach] >= level }];
  });
}
export interface Session {
  key: SubKey;
  name: string;
  before: number;
  after: number;
  ovrBefore: number;
  ovrAfter: number;
  cost: number;
  expectedCost: number;
  fitness: number;
  minutes: number;
}
export function trainSession(
  player: Player,
  key: SubKey,
  options: {
    coaches?: CoachLevels;
    center?: number;
    age?: number;
    fitness?: number;
    subs?: Subs;
  } = {},
): { subs: Subs; session: Session } | null {
  const {
    coaches = DEFAULT_COACHES,
    center = 1,
    age = player.age,
    fitness = player.fitness ?? 100,
    subs = player.attributes.subs,
  } = options;
  validateSettings(coaches, center, age);
  if (
    fitness < 35 ||
    !exerciseAccess(player.position, key, coaches).some(
      (access) => access.available,
    )
  )
    return null;
  const exercise = EXERCISES.find((exercise) => exercise.key === key);
  const before = subs[key],
    ovrBefore = modelOvr(player, subs);
  if (!exercise || before === undefined || ovrBefore === undefined) return null;
  const gain = Math.max(
    0,
    Math.min(sessionGain(age, key), player.potential - before),
  );
  if (!gain) return null;
  const next = { ...subs, [key]: before + gain };
  const ovrAfter = modelOvr(player, next);
  if (ovrAfter === undefined) return null;
  const cost = Math.floor(exercise.base * priceMultiplier(ovrBefore) + 0.5);
  return {
    subs: next,
    session: {
      key,
      name: exercise.name,
      before,
      after: before + gain,
      ovrBefore,
      ovrAfter,
      cost,
      expectedCost: cost / successRate(center),
      fitness: -8,
      minutes: exercise.minutes,
    },
  };
}
