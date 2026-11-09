/**
 * Prochain anniversaire (+1 an) d’un joueur, avec la règle du jeu :
 * un +1 tous les 40 jours après `last_age_up_date`, fait par une tâche
 * quotidienne vers 07:15 UTC ; le jeu affiche
 * max(1, 40 − jours écoulés depuis le dernier +1).
 */
export const AGING_INTERVAL_DAYS = 40;
const DAY = 86_400_000;

/** Bonus d’entraînement selon l’âge : moins de 18 ans ×3, 18-24 ×2, 25-30 ×1. */
export function trainingBonus(age: number): number {
  return age < 18 ? 3 : age <= 24 ? 2 : age <= 30 ? 1 : 0;
}

export interface NextBirthday {
  /** Jours avant le prochain +1 (au moins 1). */
  days: number;
  /** Date prévue (vers 07:15 UTC). */
  at: number;
  /** Bonus d’entraînement avant → après, s’il baisse. */
  drop?: [number, number];
}

export function nextBirthday(
  lastAgeUp: string | undefined,
  age: number,
  now = Date.now(),
): NextBirthday | null {
  const last = lastAgeUp ? Date.parse(lastAgeUp) : NaN;
  if (!Number.isFinite(last) || last > now + DAY) return null;
  const days = Math.max(
    1,
    AGING_INTERVAL_DAYS - Math.floor((now - last) / DAY),
  );
  const day = new Date(now + days * DAY);
  day.setUTCHours(7, 15, 0, 0);
  const before = trainingBonus(age),
    after = trainingBonus(age + 1);
  return {
    days,
    at: day.getTime(),
    ...(after < before ? { drop: [before, after] as [number, number] } : {}),
  };
}
