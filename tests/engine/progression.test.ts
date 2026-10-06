import { describe, expect, it } from "vitest";
import { aggregateContracts } from "../../src/engine/contracts";
import {
  matchGain,
  matchesPerSeries,
  projectMatches,
} from "../../src/engine/matchProgression";
import { reconstructHistory } from "../../src/engine/progression";
import { pasero } from "../fixtures/pasero";

it("contrats : groupe, coupe les extrêmes et ignore les salaires absents", () => {
  const players = [1, 10, 20, 30, 9999].map((wage) => ({ ...pasero, wage }));
  expect(aggregateContracts([...players, pasero])).toEqual([
    {
      group: "Tous",
      count: 5,
      retained: 3,
      min: 10,
      mean: 20,
      max: 30,
      total: 60,
    },
  ]);
  expect(aggregateContracts([])).toEqual([]);
});
it("historique : dernière valeur connue à chaque âge", () => {
  const entries = [
    { day: "2026-10-03", age: 24, overall: 90 },
    { day: "2026-10-01", age: 23, overall: 88 },
    { day: "2026-10-02", age: 23, overall: 89 },
  ];
  expect(reconstructHistory(entries, "age").map((e) => e.overall)).toEqual([
    89, 90,
  ]);
  expect(reconstructHistory(entries).map((e) => e.overall)).toEqual([
    88, 89, 90,
  ]);
});
it.each([
  [20, 8],
  [21, 12],
  [24, 12],
  [25, 16],
  [28, 16],
  [29, 20],
  [30, 20],
])("âge %i : %i matchs, doublés à 90 OVR", (age, matches) => {
  expect(matchesPerSeries(age, 89)).toBe(matches);
  expect(matchesPerSeries(age, 90)).toBe(matches * 2);
});
it.each([
  [6.59, 0],
  [6.6, 1],
  [7, 2],
  [7.4, 3],
])("note %f : +%i", (rating, gain) => expect(matchGain(rating)).toBe(gain));
it("projection : plafonnée, sans progression après 31 ans ni division par zéro", () => {
  const options = {
    age: 20,
    overall: 89,
    potential: 91,
    rating: 7.4,
    matchesPerWeek: 7,
    startDay: "2026-10-06",
  };
  expect(projectMatches(options)).toEqual([
    { day: "2026-10-14", age: 20, overall: 91, estimated: true },
  ]);
  expect(projectMatches({ ...options, age: 31 })).toEqual([]);
  expect(projectMatches({ ...options, matchesPerWeek: 0 })).toEqual([]);
  expect(matchesPerSeries(31, 80)).toBeNull();
});

describe("historique d’OVR du jeu (lecture tolérante)", () => {
  it("objets datés, sous une clé, un point par jour, tri chronologique", async () => {
    const { parseOverallHistory } =
      await import("../../src/engine/progression");
    expect(
      parseOverallHistory({
        history: [
          { created_at: "2026-10-02T10:00:00Z", overall: 81 },
          {
            created_at: "2026-09-30T10:00:00Z",
            overall: 79,
            potential: 90,
            age: 21,
          },
          { created_at: "2026-10-02T18:00:00Z", overall: 82 },
        ],
      }).map((p) => [new Date(p.t).toISOString().slice(0, 10), p.overall]),
    ).toEqual([
      ["2026-09-30", 79],
      ["2026-10-02", 82],
    ]);
  });
  it("paires [date, ovr], secondes Unix, valeurs invalides ignorées", async () => {
    const { parseOverallHistory } =
      await import("../../src/engine/progression");
    expect(
      parseOverallHistory([
        [1790000000, "77"],
        ["pas une date", 80],
        [1790100000, null],
      ]).map((p) => p.overall),
    ).toEqual([77]);
    expect(parseOverallHistory(null)).toEqual([]);
    expect(parseOverallHistory({ autre: 1 })).toEqual([]);
  });
  it("tableau imbriqué et noms de champs inconnus", async () => {
    const { parseOverallHistory } =
      await import("../../src/engine/progression");
    expect(
      parseOverallHistory({
        player: { id: "x" },
        result: {
          rows: [
            { snapshot_date: "2026-09-01", player_ovr: 90 },
            { snapshot_date: "2026-10-01", player_ovr: 96 },
          ],
        },
      }).map((p) => p.overall),
    ).toEqual([90, 96]);
  });
});
