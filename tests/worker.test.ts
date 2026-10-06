import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import worker, {
  SITE_CATALOG_SQL,
  SITE_PLAYERS_SQL,
  dbPublicPlayer,
  publicPlayer,
} from "../worker.js";
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

describe("base des joueurs du jeu (fiches légères et prix)", () => {
  it("fusionne collectes complètes et base du jeu sans doublon, avec le prix demandé", () => {
    const code = `import sqlite3, json, sys
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute('CREATE TABLE clubs(team_id TEXT, fetched_at INTEGER, players TEXT)')
db.execute('CREATE TABLE db_players(id TEXT PRIMARY KEY, name TEXT, position TEXT, age INTEGER, overall INTEGER, potential INTEGER, club_id TEXT, club_name TEXT, free_agent INTEGER, transfer_price INTEGER, loan_fee INTEGER, seen_at INTEGER)')
db.execute('INSERT INTO clubs VALUES(?,?,?)', ('t', 1, json.dumps([{'id':'a','name':'Complet','position':'CM','age':20,'overall':80,'potential':90}])))
db.execute("INSERT INTO db_players VALUES('a','Complet','CM',20,81,90,'t','Club',0,5000,NULL,9)")
db.execute("INSERT INTO db_players VALUES('b','Leger','ST',30,85,86,'u','Autre',0,NULL,700,9)")
sql = sys.stdin.read()
rows = [dict(r) for r in db.execute(sql+' SELECT id, overall, potential, light, transfer_price, loan_fee FROM merged ORDER BY overall DESC')]
print(json.dumps(rows))`;
    const rows = JSON.parse(
      execFileSync("python", ["-c", code], {
        input: SITE_CATALOG_SQL,
        encoding: "utf8",
      }),
    );
    expect(rows).toEqual([
      {
        id: "b",
        overall: 85,
        potential: 86,
        light: 1,
        transfer_price: null,
        loan_fee: 700,
      },
      {
        id: "a",
        overall: 80,
        potential: 90,
        light: 0,
        transfer_price: 5000,
        loan_fee: null,
      },
    ]);
  }, 30000);
  it("publie une fiche légère compatible avec le schéma, sans champ privé", () => {
    const player = dbPublicPlayer({
      id: "b",
      name: "Leger",
      position: "GK",
      age: 30,
      overall: 92,
      potential: 99,
      attrs: JSON.stringify({
        div: 99,
        ref: 94,
        han: 99,
        spe: 77,
        kic: 89,
        pos: 96,
        secret: 1,
      }),
      traits: JSON.stringify(["Workhorse", { private: true }]),
      club_id: "u",
      free_agent: 0,
      nationality: "Netherlands",
      value: 2050000,
      seen_at: 1,
      leased_by: "private",
    });
    const parsed = playerSchema.parse(player);
    expect(parsed.attributes.div).toBe(99);
    expect(parsed.attributes.subs).toEqual({});
    expect(parsed.traits).toEqual(["Workhorse"]);
    expect(JSON.stringify(player)).not.toContain("private");
    expect(JSON.stringify(player)).not.toContain("secret");
  });
});
