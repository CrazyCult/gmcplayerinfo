import type { FieldStat, Player, SubKey, Subs } from "../types";
import { familyOf, modelOvr } from "./ovr";
import {
  DEFAULT_COACHES,
  EXERCISES,
  FIELD_GROUPS,
  GK_GROUPS,
  MAX_COACHES,
  WEIGHTS,
  type CoachLevels,
} from "./tables";
import {
  exerciseAccess,
  priceMultiplier,
  sessionGain,
  trainSession,
  validateSettings,
  type Session,
} from "./training";

export interface PlanOptions {
  coaches?: CoachLevels;
  center?: number;
  age?: number;
  fitness?: number;
}
export interface TrainingPlan {
  from: number | undefined;
  to: number | undefined;
  cap: number;
  sessions: number;
  cost: number;
  expectedCost: number;
  fitness: number;
  recharges: number;
  subs: Subs;
  drills: Record<string, number>;
  milestones: { ovr: number; sessions: number; cost: number }[];
  sequence: Session[];
  incomplete: boolean;
  limited: boolean;
}
function influence(player: Player, key: SubKey): number {
  const family = familyOf(player.position);
  if (family === "GK") {
    const group = Object.values(GK_GROUPS).find((keys) => keys.includes(key));
    return group ? 1 / (6 * group.length) : 0;
  }
  const stats = Object.keys(FIELD_GROUPS) as FieldStat[];
  const index = stats.findIndex((stat) => FIELD_GROUPS[stat].includes(key));
  return index < 0
    ? 0
    : WEIGHTS[family][index] / (100 * FIELD_GROUPS[stats[index]].length);
}
export function planTraining(
  player: Player,
  options: PlanOptions = {},
): TrainingPlan {
  const coaches = options.coaches ?? DEFAULT_COACHES,
    center = options.center ?? 1,
    age = options.age ?? player.age;
  validateSettings(coaches, center, age);
  let subs = { ...player.attributes.subs };
  const from = modelOvr(player, subs);
  let ovr = from;
  const sequence: Session[] = [];
  let lastImprovement = 0;
  const candidates = EXERCISES.map((exercise) => ({
    ...exercise,
    weight: influence(player, exercise.key),
    gain: sessionGain(age, exercise.key),
  })).filter(
    (exercise) =>
      exercise.weight > 0 &&
      exercise.gain > 0 &&
      exerciseAccess(player.position, exercise.key, coaches).some(
        (access) => access.available,
      ),
  );
  for (
    let step = 0;
    from !== undefined &&
    ovr !== undefined &&
    ovr < player.potential &&
    step < 400;
    step++
  ) {
    let bestKey: SubKey | undefined,
      bestScore = 0;
    for (const exercise of candidates) {
      const value = subs[exercise.key];
      if (value === undefined || value >= player.potential) continue;
      const gain = Math.min(exercise.gain, player.potential - value);
      const cost = Math.floor(exercise.base * priceMultiplier(ovr) + 0.5);
      const score = (exercise.weight * gain) / cost;
      if (score > bestScore) {
        bestKey = exercise.key;
        bestScore = score;
      }
    }
    const best = bestKey
      ? trainSession(player, bestKey, {
          coaches,
          center,
          age,
          fitness: 100,
          subs,
        })
      : null;
    if (!best) break;
    subs = best.subs;
    sequence.push(best.session);
    if (best.session.ovrAfter > ovr) lastImprovement = sequence.length;
    ovr = best.session.ovrAfter;
  }
  const limited =
    sequence.length === 400 && ovr !== undefined && ovr < player.potential;
  sequence.splice(lastImprovement);
  subs = { ...player.attributes.subs };
  const drills: Record<string, number> = {},
    milestones: TrainingPlan["milestones"] = [];
  let cost = 0,
    expectedCost = 0,
    fitness = options.fitness ?? player.fitness ?? 100,
    recharges = 0;
  for (const [index, session] of sequence.entries()) {
    subs[session.key] = session.after;
    cost += session.cost;
    expectedCost += session.expectedCost;
    drills[session.name] = (drills[session.name] ?? 0) + 1;
    if (fitness < 35) {
      fitness = 100;
      recharges++;
    }
    fitness -= 8;
    if (session.ovrAfter > session.ovrBefore)
      milestones.push({ ovr: session.ovrAfter, sessions: index + 1, cost });
  }
  return {
    from,
    to: modelOvr(player, subs),
    cap: player.potential,
    sessions: sequence.length,
    cost,
    expectedCost,
    fitness: -8 * sequence.length,
    recharges,
    subs,
    drills,
    milestones,
    sequence,
    incomplete: from === undefined,
    limited,
  };
}
export function planVariants(player: Player, options: PlanOptions = {}) {
  const current = planTraining(player, options);
  const unlocked = planTraining(player, { ...options, coaches: MAX_COACHES });
  const age = options.age ?? player.age;
  return {
    current,
    unlocked: (unlocked.to ?? -1) > (current.to ?? -1) ? unlocked : null,
    afterBirthday:
      age === 24 || age === 30
        ? planTraining(player, { ...options, age: age + 1 })
        : null,
  };
}
export function ovrLevers(player: Player, options: PlanOptions = {}) {
  return EXERCISES.map((exercise) => {
    let subs = player.attributes.subs,
      cost = 0,
      sessions = 0;
    const from = modelOvr(player);
    let to = from;
    while (from !== undefined && to === from && sessions < 400) {
      const result = trainSession(player, exercise.key, {
        ...options,
        subs,
        fitness: 100,
      });
      if (!result) break;
      subs = result.subs;
      cost += result.session.cost;
      sessions++;
      to = result.session.ovrAfter;
    }
    return {
      ...exercise,
      sessions,
      cost,
      to,
      progresses: from !== undefined && to !== undefined && to > from,
    };
  }).sort(
    (a, b) => Number(b.progresses) - Number(a.progresses) || a.cost - b.cost,
  );
}
