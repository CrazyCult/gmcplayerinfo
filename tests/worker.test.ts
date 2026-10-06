import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, {
  dbPublicPlayer,
  migrateStep,
  publicPlayer,
} from "../worker.js";
import { FIELD_SUBS, GK_SUBS } from "../src/types";
import { playerSchema } from "../src/schemas/player";
import { supabase } from "./supabase-mock";
import { d1 } from "./d1-mock";

let sb: Awaited<ReturnType<typeof supabase>>;
const base = {
  SITE_TOKEN: "tok",
  SUPABASE_URL: "https://projet.supabase.co",
  SUPABASE_SECRET_KEY: "secret",
};
beforeEach(async () => {
  sb = await supabase();
  vi.stubGlobal("fetch", sb.fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function setup(extra: Record<string, unknown> = {}) {
  const env = { ...base, ...extra };
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    site = false,
  ) => {
    const response = await worker.fetch(
      new Request(`https://index.test${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: site ? { Authorization: "Bearer tok" } : {},
      }),
      env,
    );
    return { status: response.status, body: await response.json() };
  };
  return { env, call };
}
const full = (id: string, overall = 80, extra = {}) => ({
  id,
  name: `Joueur ${id}`,
  position: "CM",
  age: 22,
  overall,
  potential: overall + 5,
  attributes: { pac: 80, vision: 81 },
  ...extra,
});
const light = (id: string, extra = {}) => ({
  id,
  name: `Leger ${id}`,
  position: "ST",
  age: 24,
  overall: 85,
  potential: 88,
  club_id: "clubL",
  club_name: "Club L",
  attributes: { pac: 90, sho: 85, pas: 70, dri: 80, def: 40, phy: 75 },
  ...extra,
});
const ids = (r: { body: { players: { player: { id: string } }[] } }) =>
  r.body.players.map((p) => p.player.id);

describe("accès et confidentialité", () => {
  it("refuse le site sans secret, sans appeler Supabase", async () => {
    const response = await worker.fetch(
      new Request("https://index.test/v1/site/players"),
      { ...base, SITE_TOKEN: "x" },
    );
    expect(response.status).toBe(401);
    expect(sb.calls).toEqual([]);
  });
  it("refuse les écritures sur les routes de lecture du site", async () => {
    expect(
      (await setup().call("POST", "/v1/site/players", undefined, true)).status,
    ).toBe(405);
  });
  it("applique la limitation de débit", async () => {
    const { call } = setup({
      SITE_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    expect(
      (await call("GET", "/v1/site/players", undefined, true)).status,
    ).toBe(429);
  });
  it("ne publie aucun champ privé, garde les attributs du moteur", () => {
    const subs = Object.fromEntries(
      [...FIELD_SUBS, ...GK_SUBS].map((k) => [k, 80]),
    );
    const player = publicPlayer({
      team_id: "club",
      data: {
        id: "p",
        name: "J",
        position: "CM",
        age: 25,
        overall: 80,
        potential: 90,
        contributor: "private",
        traits: [{ m: "private" }],
        attributes: { ...subs, pac: 80, secret: "private" },
      },
    });
    expect(playerSchema.parse(player).attributes.subs).toEqual(subs);
    expect(JSON.stringify(player)).not.toContain("private");
  });
  it("fiche légère compatible avec le schéma (jsonb ou texte)", () => {
    const player = dbPublicPlayer({
      id: "b",
      name: "L",
      position: "GK",
      age: 30,
      overall: 92,
      potential: 99,
      attrs: {
        div: 99,
        ref: 94,
        han: 99,
        spe: 77,
        kic: 89,
        pos: 96,
        secret: 1,
      },
      traits: ["Workhorse", { private: true }],
      club_id: "u",
    });
    expect(playerSchema.parse(player).attributes.div).toBe(99);
    expect(JSON.stringify(player)).not.toContain("private");
  });
  it("aucune fonction n’est accessible sans la clé secrète", async () => {
    const { call } = setup({ SUPABASE_SECRET_KEY: "mauvaise" });
    expect(
      (await call("GET", "/v1/site/players", undefined, true)).status,
    ).toBe(500);
  });
});

describe("index commun (extension)", () => {
  it("stocke le club le plus récent, redonne les clubs et l’index", async () => {
    const { call } = setup();
    const now = Date.now();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "t1", fetchedAt: now, players: [full("a")] }],
    });
    await call("POST", "/v1/clubs", {
      clubs: [
        { teamId: "t1", fetchedAt: now - 1000, players: [full("vieux")] },
      ],
    });
    const got = (await call("GET", "/v1/clubs?since=0")).body;
    expect(got.clubs[0].players[0].id).toBe("a");
    expect(got.more).toBe(false);
    expect((await call("GET", "/v1/index")).body.clubs).toEqual([["t1", now]]);
    expect((await call("GET", "/v1/stats")).body.clubs).toBe(1);
  });
  it("rejette les effectifs invalides", async () => {
    const r = await setup().call("POST", "/v1/clubs", {
      clubs: [{ teamId: "t", fetchedAt: Date.now(), players: [{ id: "x" }] }],
    });
    expect(r.body).toEqual({ accepted: 0, rejected: 1 });
  });
  it("répartit les clubs : demandes du site d’abord, réservation 30 min, clubs frais exclus", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "frais", fetchedAt: Date.now(), players: [full("f")] }],
    });
    await call("POST", "/v1/db/players", {
      players: [light("p1", { club_id: "clubX" })],
    });
    await call("POST", "/v1/site/request/p1", undefined, true);
    expect(
      (
        await call("POST", "/v1/assign", {
          limit: 5,
          candidates: ["a", "frais"],
        })
      ).body.assigned,
    ).toEqual(["clubX", "a"]);
    expect(
      (await call("POST", "/v1/assign", { limit: 5, candidates: ["a", "b"] }))
        .body.assigned,
    ).toEqual(["b"]);
  });
});

describe("base du jeu et catalogue", () => {
  it("fusionne effectifs complets et base du jeu, sans doublon, avec les prix", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "t1",
          fetchedAt: Date.now(),
          players: [full("a", 80), full("b", 90)],
        },
      ],
    });
    await call("POST", "/v1/db/players", {
      a: "transfer",
      p: 1,
      total: 30,
      players: [light("b", { overall: 91, transfer_price: 5000 }), light("c")],
    });
    const all = await call("GET", "/v1/site/players", undefined, true);
    expect(ids(all)).toEqual(["b", "c", "a"]);
    expect(all.body.players[0]).toMatchObject({
      light: false,
      player: { overall: 90 },
      market: { transferPrice: 5000 },
    });
    expect(all.body.total).toBe(3);
    expect(
      ids(await call("GET", "/v1/site/players?sort=price", undefined, true)),
    ).toEqual(["b"]);
    expect(
      ids(await call("GET", "/v1/site/players?avail=full", undefined, true)),
    ).toEqual(["b", "a"]);
    expect(
      (await call("GET", "/v1/db/prices?id=b")).body.prices[0],
    ).toMatchObject({ kind: "transfer", price: 5000 });
  });
  it("recherche par début du nom ou du nom de famille, accents ignorés", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "t1",
          fetchedAt: Date.now(),
          players: [
            full("x", 70, { name: "Kévin De Bruyn" }),
            full("y", 71, { name: "Paolo Maldino" }),
          ],
        },
      ],
    });
    const q = async (s: string) =>
      ids(
        await call(
          "GET",
          `/v1/site/players?q=${encodeURIComponent(s)}`,
          undefined,
          true,
        ),
      );
    expect(await q("kevin")).toEqual(["x"]);
    expect(await q("bruy")).toEqual(["x"]);
    expect(await q("MALDINO")).toEqual(["y"]);
    expect(await q("zzz")).toEqual([]);
    expect(
      ids(await call("GET", "/v1/site/search?q=mal", undefined, true)),
    ).toEqual(["y"]);
  });
  it("fiche complète, fiche légère, comparables et 404", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "t1",
          fetchedAt: Date.now(),
          players: [full("a", 85, { position: "ST", age: 24 })],
        },
      ],
    });
    await call("POST", "/v1/db/players", {
      players: [
        light("c", { transfer_price: 7000 }),
        light("d", { transfer_price: 9000, overall: 86 }),
      ],
    });
    const a = (await call("GET", "/v1/site/player/a", undefined, true)).body;
    expect(a).toMatchObject({
      light: false,
      teamId: "t1",
      player: { attributes: { vision: 81 } },
    });
    expect(a.comparables.map((r: { price: number }) => r.price).sort()).toEqual(
      [7000, 9000],
    );
    const c = (await call("GET", "/v1/site/player/c", undefined, true)).body;
    expect(c).toMatchObject({
      light: true,
      market: { transferPrice: 7000 },
      player: { attributes: { pac: 90 } },
    });
    expect(playerSchema.parse(c.player).attributes.sho).toBe(85);
    expect(
      (await call("GET", "/v1/site/player/zz", undefined, true)).status,
    ).toBe(404);
  });
  it("pages de la base : marché toutes les heures, base complète ensuite, réservation", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      a: "all",
      p: 1,
      total: 48,
      players: [light("c")],
    });
    await call("POST", "/v1/db/players", {
      a: "transfer",
      p: 1,
      total: 30,
      players: [light("t", { transfer_price: 9 })],
    });
    const t = (await call("POST", "/v1/db/assign", { limit: 5 })).body.tasks;
    expect(t).toEqual([
      { a: "loan", p: 1, kind: "market" },
      { a: "transfer", p: 2, kind: "market" },
      { a: "all", p: 2, kind: "full" },
    ]);
    expect(
      (await call("POST", "/v1/db/assign", { limit: 5 })).body.tasks,
    ).toEqual([]);
    const stats = (await call("GET", "/v1/db/stats")).body;
    expect(stats).toMatchObject({
      players: 2,
      transfer: 1,
      totals: { all: 48, transfer: 30 },
    });
  });
  it("demande de fiche complète : une fois, refus pour un agent libre, état mis à jour", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [
        light("p1", { club_id: "clubX" }),
        light("free", { free_agent: true, club_id: "sys" }),
      ],
    });
    expect(
      (await call("GET", "/v1/site/request/p1", undefined, true)).status,
    ).toBe(405);
    expect(
      (await call("POST", "/v1/site/request/p1", undefined, true)).body.status,
    ).toBe("demande");
    expect(
      (await call("POST", "/v1/site/request/p1", undefined, true)).body.status,
    ).toBe("deja-demande");
    expect(
      (await call("POST", "/v1/site/request/free", undefined, true)).status,
    ).toBe(409);
    await call("POST", "/v1/clubs", {
      clubs: [
        { teamId: "clubX", fetchedAt: Date.now(), players: [full("p1")] },
      ],
    });
    expect(
      (await call("GET", "/v1/site/status/p1", undefined, true)).body,
    ).toMatchObject({ light: false, requestedAt: null });
    expect(
      (await call("GET", "/v1/site/player/p1", undefined, true)).body.light,
    ).toBe(false);
  });
});

describe("migration depuis D1", () => {
  it("recopie clubs et base du jeu puis s’arrête", async () => {
    const old = d1();
    old.db
      .exec(`CREATE TABLE clubs (team_id TEXT PRIMARY KEY, fetched_at INTEGER, updated_at INTEGER, contributor TEXT, players TEXT);
      CREATE TABLE db_players (id TEXT PRIMARY KEY, name TEXT, position TEXT, age INTEGER, overall INTEGER, potential INTEGER, value INTEGER,
        club_id TEXT, club_name TEXT, nationality TEXT, flag_code TEXT, free_agent INTEGER, transfer_price INTEGER, loan_fee INTEGER,
        traits TEXT, attrs TEXT, portrait_url TEXT, seen_at INTEGER)`);
    old.db
      .prepare("INSERT INTO clubs VALUES (?, ?, ?, ?, ?)")
      .run(
        "old",
        1700000000000,
        1700000000000,
        "x",
        JSON.stringify([full("o1"), full("o2")]),
      );
    old.db
      .prepare(
        `INSERT INTO db_players VALUES ('l1', 'Leger Un', 'ST', 20, 70, 80, 1000, 'k', 'K', 'France', 'FR', 0, 4000, NULL,
      '["Speedster"]', '{"pac":90}', NULL, 1)`,
      )
      .run();
    const { env, call } = setup({ DB: old.DB });
    for (let i = 0; i < 4; i++) await migrateStep(env);
    expect(
      ids(await call("GET", "/v1/site/players", undefined, true)).sort(),
    ).toEqual(["l1", "o1", "o2"]);
    expect(
      (await call("GET", "/v1/site/player/l1", undefined, true)).body,
    ).toMatchObject({ light: true, market: { transferPrice: 4000 } });
    expect(await migrateStep(env)).toEqual({ done: true });
  });
});
