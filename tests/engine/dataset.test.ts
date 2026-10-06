import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { modelOvr } from "../../src/engine/ovr";
import { gkStats, summaryStats } from "../../src/engine/stats";
import { calculationPlayerSchema } from "../../src/schemas/player";
import { z } from "zod";

const fixture = new URL("../fixtures/ovr-dataset.json", import.meta.url);
const available = existsSync(fixture);
describe.skipIf(!available)(
  "validation sur le dataset réel (requis avant l’interface)",
  () => {
    const report: {
      group: string;
      count: number;
      exact: number;
      accuracy: number;
      mismatches: unknown[];
    }[] = [];
    const statMismatches: {
      row: number;
      position: string;
      stat: string;
      game: number | undefined;
      calculated: number | undefined;
      subs: unknown;
    }[] = [];
    let total = 0;
    let totalStats = 0;
    beforeAll(() => {
      const input = JSON.parse(readFileSync(fixture, "utf8"));
      const players = z
        .array(calculationPlayerSchema)
        .min(1)
        .parse(
          Array.isArray(input) ? input : (input.players ?? input.data?.players),
        );
      total = players.length;
      for (const keeper of [false, true]) {
        const group = players.filter(
          (player) => (player.position === "GK") === keeper,
        );
        expect(group.length).toBeGreaterThan(0);
        const mismatches: {
          row: number;
          position: string;
          game: number;
          calculated: number | undefined;
        }[] = [];
        for (const player of group) {
          const row = players.indexOf(player) + 1;
          expect(
            player.attributes?.subs,
            `Sous-attributs non normalisés ligne ${row}`,
          ).toBeDefined();
          const stats = keeper
            ? gkStats(player.attributes.subs)
            : summaryStats(player.attributes.subs);
          for (const [key, value] of Object.entries(stats)) {
            totalStats++;
            const game = player.attributes[key as keyof typeof stats];
            if (value === undefined || value !== game)
              statMismatches.push({
                row,
                position: player.position,
                stat: key,
                game,
                calculated: value,
                subs: player.attributes.subs,
              });
          }
          const calculated = modelOvr(player);
          if (calculated !== player.overall)
            mismatches.push({
              row,
              position: player.position,
              game: player.overall,
              calculated,
            });
        }
        const accuracy = 1 - mismatches.length / group.length;
        report.push({
          group: keeper ? "GK" : "champ",
          count: group.length,
          exact: group.length - mismatches.length,
          accuracy,
          mismatches,
        });
      }
      const summary = {
        total,
        totalStats,
        exactStats: totalStats - statMismatches.length,
        summaryStatsAccuracy: 1 - statMismatches.length / totalStats,
        statMismatches,
        groups: report,
      };
      const directory = new URL("../../reports/", import.meta.url);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        new URL("dataset-validation.json", directory),
        JSON.stringify(summary, null, 2),
      );
      console.info(
        JSON.stringify(
          {
            total,
            totalStats,
            statMismatches: statMismatches.length,
            groups: report.map(({ group, count, exact, accuracy }) => ({
              group,
              count,
              exact,
              accuracy,
            })),
          },
          null,
          2,
        ),
      );
    }, 30000);
    // Écart documenté et poursuite autorisée par l’utilisateur le 6 octobre 2026.
    const statsTest = process.env.GMC_STRICT_DATASET === "1" ? it : it.fails;
    statsTest(
      "stats 100 % : échec connu sur 13 stats, données et formules inchangées",
      () => {
        expect(
          statMismatches,
          `${statMismatches.length} écarts : voir reports/dataset-validation.json`,
        ).toHaveLength(0);
      },
    );
    it.each(["champ", "GK"])("OVR ≥98 % pour le groupe %s", (group) => {
      const result = report.find((entry) => entry.group === group)!;
      expect(
        result.accuracy,
        `${result.count - result.exact} écarts sur ${result.count} : voir reports/dataset-validation.json`,
      ).toBeGreaterThanOrEqual(0.98);
    });
  },
);
