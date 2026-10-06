import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import worker, { SITE_PLAYERS_SQL, publicPlayer } from "../worker.js";
import { FIELD_SUBS, GK_SUBS } from "../src/types";
import { playerSchema } from "../src/schemas/player";

describe("lecture des collectes Companion", () => {
  it("refuse l’accès sans secret, sans toucher à D1 ni à la licence", async () => {
    const prepare = vi.fn();
    const response = await worker.fetch(
      new Request("https://index.test/v1/site/players"),
      { DB: { prepare }, PUBLIC_KEY_JWK: "invalid" },
    );
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("refuse les écritures même avec le secret site", async () => {
    const response = await worker.fetch(
      new Request("https://index.test/v1/site/players", {
        method: "POST",
        headers: { Authorization: "Bearer test" },
      }),
      { SITE_TOKEN: "test" },
    );
    expect(response.status).toBe(405);
  });
  it("ne publie aucun champ privé, et conserve tous les attributs utilisés par le moteur", () => {
    const subs = Object.fromEntries(
      [...FIELD_SUBS, ...GK_SUBS].map((key) => [key, 80]),
    );
    const player = publicPlayer({
      team_id: "club",
      data: {
        id: "p",
        name: "Joueur",
        position: "CM",
        age: 25,
        overall: 80,
        potential: 90,
        contributor: "private",
        traits: [{ manager: "private" }],
        manager: { email: "private" },
        club: { manager: "private" },
        attributes: { ...subs, pac: 80, secret: "private" },
      },
    });
    expect(playerSchema.parse(player).attributes.subs).toEqual(subs);
    expect(JSON.stringify(player)).not.toContain("private");
    expect(player.club_id).toBe("club");
  });
  it("lit les anciennes collectes, dédoublonne les transferts et pagine tous les joueurs dans SQLite", () => {
    const code = `import sqlite3, json, sys
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute('CREATE TABLE clubs(team_id TEXT, fetched_at INTEGER, players TEXT)')
players = [{'id': str(i), 'name': 'Player '+str(i), 'overall': 70+i%20, 'position':'CM'} for i in range(125)]
db.execute('INSERT INTO clubs VALUES(?,?,?)', ('old', 1, json.dumps(players)))
db.execute('INSERT INTO clubs VALUES(?,?,?)', ('new', 2, json.dumps([dict(players[0], name='Transferred', overall=100)])))
sql = sys.stdin.read()
pages = [[dict(r) for r in db.execute(sql+' SELECT id, name, team_id FROM players ORDER BY overall DESC, id ASC LIMIT 50 OFFSET ?', (offset,))] for offset in (0,50,100)]
print(json.dumps({'total':db.execute(sql+' SELECT COUNT(*) FROM players').fetchone()[0], 'pages':pages}))`;
    const result = JSON.parse(
      execFileSync("python", ["-c", code], {
        input: SITE_PLAYERS_SQL,
        encoding: "utf8",
      }),
    );
    expect(result.total).toBe(125);
    expect(result.pages.map((page: unknown[]) => page.length)).toEqual([
      50, 50, 25,
    ]);
    expect(result.pages[0][0]).toEqual({
      id: "0",
      name: "Transferred",
      team_id: "new",
    });
    const ids = result.pages.flat().map((row: { id: string }) => row.id);
    expect(new Set(ids).size).toBe(125);
  }, 30000);
  it("applique la limitation de débit avant de lire D1", async () => {
    const response = await worker.fetch(
      new Request("https://index.test/v1/site/players", {
        headers: { Authorization: "Bearer test" },
      }),
      {
        SITE_TOKEN: "test",
        SITE_RATE_LIMITER: { limit: async () => ({ success: false }) },
      },
    );
    expect(response.status).toBe(429);
  });
});
