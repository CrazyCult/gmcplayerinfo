import { describe, it, expect } from "vitest";
import { parseSquadExport, squadCsv } from "@/lib/squad-export";
const player = (id: string) => ({
  id,
  name: id,
  position: "CM",
  age: 23,
  overall: 80,
  potential: 95,
  attributes: { pac: 80, finishing: 0 },
  traits: [],
  matches_played: id === "a" ? 0 : undefined,
});
const input = () => ({
  version: 2,
  collectedAt: "2026-10-08T12:00:00.000Z",
  tactics: {
    formation: "4-3-3",
    tempo: "fast",
    lineup: [{ playerId: "a", position: "CM", role: "playmaker" }],
    substitutes: [{ playerId: "b", position: "CM" }],
    secret: "exclude",
  },
  players: [player("a"), player("b"), player("reserve")],
});
describe("tactical export", () => {
  it("retains reserves, exact slots, tactics and real zero counts", () => {
    const data = parseSquadExport(input());
    expect(data.players).toHaveLength(3);
    expect(data.players[0].matchesPlayed).toBe(0);
    expect(data.players[1].matchesPlayed).toBeUndefined();
    expect(data.tactics?.tempo).toBe("fast");
    expect(data.tactics).not.toHaveProperty("secret");
    const csv = squadCsv(data);
    expect(csv).toContain('"titulaire"');
    expect(csv).toContain('"banc"');
    expect(csv).toContain('"reserve"');
    const rows = csv
      .slice(1)
      .split("\r\n")
      .map((r) => r.split(";"));
    const col = rows[0].indexOf('"matchs_joues"');
    expect(rows[1][col]).toBe('"0"');
    expect(rows[2][col]).toBe('""');
  });
  it("exports unknown composition explicitly rather than assigning a XI", () => {
    const data = parseSquadExport({ ...input(), tactics: null });
    expect(squadCsv(data)).toContain('"inconnu"');
  });
  it("quotes delimiters, newlines and dangerous spreadsheet text", () => {
    const raw = input();
    raw.players[0].name = '=test;"x"\nnext';
    const csv = squadCsv(parseSquadExport(raw));
    expect(csv).toContain('"\'=test;""x""\nnext"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("rejects missing selected players and duplicate assignments", () => {
    const raw = input();
    raw.tactics.lineup[0].playerId = "missing";
    expect(() => parseSquadExport(raw)).toThrow(/manque/);
    raw.tactics.lineup[0].playerId = "b";
    expect(() => parseSquadExport(raw)).toThrow(/plusieurs/);
  });
  it("reads previous version one exports", () => {
    expect(parseSquadExport({ ...input(), version: 1 }).players).toHaveLength(
      3,
    );
  });
});
