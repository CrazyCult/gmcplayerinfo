import type { ClubMatch } from "@/data/gmc-index";

const GOAL_FR: Record<string, string> = {
  long: "frappe de loin",
  inBehind: "ballon dans le dos de la défense",
  setHeader: "tête sur coup de pied arrêté",
  header: "tête",
  corner: "corner",
  cutback: "passe en retrait",
  combo: "combinaison",
  dribble: "dribble",
  cross: "centre",
  volley: "volée",
  counter: "contre-attaque",
  penalty: "penalty",
  freeKick: "coup franc",
  thru: "passe en profondeur",
};

const pct = (a: number, b: number) =>
  b > 0 ? Math.round((100 * a) / b) : null;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Tendances sur plusieurs matchs (mêmes calculs que le panneau de l’extension). */
export function matchTrends(matches: ClubMatch[]) {
  const n = matches.length;
  if (!n) return null;
  const sum = (f: (m: ClubMatch) => number) =>
    matches.reduce((total, m) => total + (f(m) || 0), 0);
  const gf = sum((m) => m.gf),
    ga = sum((m) => m.ga),
    xf = sum((m) => m.st.xg[0]),
    xa = sum((m) => m.st.xg[1]);
  const decided = matches.filter((m) => m.gf !== m.ga);
  const agree = decided.filter(
    (m) => m.gf > m.ga === m.st.xg[0] > m.st.xg[1],
  ).length;
  const conceded: Record<string, number> = {};
  for (const m of matches)
    for (const [k, v] of Object.entries(m.st.gAgainst))
      conceded[k] = (conceded[k] || 0) + v;
  const shots = sum((m) => m.st.shc.l + m.st.shc.c + m.st.shc.r);
  const wins = matches.filter((m) => m.gf > m.ga).length,
    draws = matches.filter((m) => m.gf === m.ga).length;
  return {
    n,
    wins,
    draws,
    losses: n - wins - draws,
    gf,
    ga,
    xgFor: r1(xf),
    xgAgainst: r1(xa),
    finishing: r1(gf - xf),
    defending: r1(xa - ga),
    conversion: pct(
      gf,
      sum((m) => m.st.shots[0]),
    ),
    centralShotsPct: pct(
      sum((m) => m.st.shc.c),
      shots,
    ),
    possAvg: Math.round(sum((m) => m.st.poss[0]) / n),
    en90Avg: Math.round(sum((m) => m.st.en[2] ?? 0) / n),
    noSubLosses: matches.filter((m) => m.gf <= m.ga && m.st.subsUsed[0] === 0)
      .length,
    conceded: Object.entries(conceded)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [GOAL_FR[k] ?? k, v] as const),
    xgAgrees: decided.length ? ([agree, decided.length] as const) : null,
  };
}
