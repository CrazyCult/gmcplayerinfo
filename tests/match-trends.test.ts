import { expect, it, vi } from "vitest";
import digest from "./fixtures/match-digest.json";

vi.mock("server-only", () => ({}));

// Résumé produit par l'extension (match-stats-core.js) pour un match réel.
it("reads the extension's match digest and computes trends", async () => {
  vi.stubEnv("GMC_INDEX_URL", "https://index.test");
  vi.stubEnv("GMC_SITE_TOKEN", "tok");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        matches: [
          digest,
          { id: "cassé" },
          { ...digest, id: "b", gf: 2, ga: 1 },
          { ...digest, id: "c", gf: 1, ga: 1 },
        ],
      }),
    ),
  );
  const { getClubMatches } = await import("@/data/gmc-index");
  const { matchTrends } = await import("@/lib/matchTrends");
  const matches = await getClubMatches("T1");
  expect(matches).toHaveLength(3);
  expect(matches[0].ins?.verdict).toBe("Dominé mais pas récompensé");
  expect(matches[0].st.players[0]).toMatchObject({ n: "Roberts", w: 8, l: 5 });
  const t = matchTrends(matches)!;
  expect(t).toMatchObject({
    n: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    gf: 3,
    ga: 4,
    xgFor: 10.4,
    finishing: -7.4,
    centralShotsPct: 61,
    noSubLosses: 2,
  });
  expect(t.xgAgrees).toEqual([1, 2]);
  expect(t.conceded[0]).toEqual(["ballon dans le dos de la défense", 3]);
  expect(matchTrends([])).toBeNull();
  vi.unstubAllEnvs();
});
