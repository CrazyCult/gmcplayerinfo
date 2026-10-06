export function matchesPerSeries(age: number, ovr: number): number | null {
  if (age >= 31) return null;
  return (
    (age <= 20 ? 8 : age <= 24 ? 12 : age <= 28 ? 16 : 20) * (ovr >= 90 ? 2 : 1)
  );
}
export const matchGain = (rating: number): number =>
  rating >= 7.4 ? 3 : rating >= 7 ? 2 : rating >= 6.6 ? 1 : 0;
/** Projection estimée : prochain anniversaire dans 40 jours, rythme régulier, matchs ≥45 min. */
export function projectMatches(options: {
  age: number;
  overall: number;
  potential: number;
  rating: number;
  matchesPerWeek: number;
  startDay: string;
}) {
  const { age, potential, rating, matchesPerWeek, startDay } = options;
  const start = Date.parse(`${startDay}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(matchesPerWeek) ||
    matchesPerWeek < 0
  )
    throw new RangeError("Projection invalide");
  let overall = options.overall,
    matches = 0,
    elapsed = 0;
  const points: {
    day: string;
    age: number;
    overall: number;
    estimated: true;
  }[] = [];
  const gain = matchGain(rating);
  if (!gain || !matchesPerWeek || age >= 31 || overall >= potential)
    return points;
  const interval = 7 / matchesPerWeek;
  for (let count = 0; count < 10000; count++) {
    elapsed += interval;
    const currentAge = age + Math.floor(elapsed / 40);
    const required = matchesPerSeries(currentAge, overall);
    if (required === null) break;
    matches++;
    if (matches < required) continue;
    matches = 0;
    overall = Math.min(potential, overall + gain);
    points.push({
      day: new Date(start + elapsed * 86400000).toISOString().slice(0, 10),
      age: currentAge,
      overall,
      estimated: true,
    });
    if (overall >= potential) break;
  }
  return points;
}
