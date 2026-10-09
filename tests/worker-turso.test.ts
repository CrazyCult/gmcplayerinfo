import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker.js";
import { playerSchema } from "../src/schemas/player";
import { turso } from "./turso-mock";

let t: ReturnType<typeof turso>;
let n = 0;
beforeEach(() => {
  t = turso();
  vi.stubGlobal("fetch", t.fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

// Une base Turso distincte par test (l'adaptateur est mis en cache par URL).
function setup(extra: Record<string, unknown> = {}) {
  const env = {
    SITE_TOKEN: "tok",
    TURSO_URL: `libsql://gmc-test${++n}.turso.io`,
    TURSO_TOKEN: "tok-turso",
    ...extra,
  };
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

describe("Worker sur Turso (API HTTP)", () => {
  it("refuse un mauvais jeton Turso proprement", async () => {
    const { call } = setup({ TURSO_TOKEN: "faux" });
    const r = await call("GET", "/v1/site/players", undefined, true);
    expect(r.status).toBe(500);
    expect(r.body.detail).toContain("401");
  });
  it("index commun : stocke, redonne, index et répartition", async () => {
    const { call } = setup();
    const now = Date.now();
    expect(
      (
        await call("POST", "/v1/clubs", {
          clubs: [{ teamId: "t1", fetchedAt: now, players: [full("a")] }],
        })
      ).body,
    ).toEqual({ accepted: 1, rejected: 0 });
    expect(
      (await call("GET", "/v1/clubs?since=0")).body.clubs[0].players[0].id,
    ).toBe("a");
    expect((await call("GET", "/v1/index")).body.clubs).toEqual([["t1", now]]);
    expect(
      (await call("POST", "/v1/assign", { limit: 5, candidates: ["t1", "t2"] }))
        .body.assigned,
    ).toEqual(["t2"]);
  });
  it("catalogue fusionné, recherche, fiches complète et légère, prix", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "t1",
          fetchedAt: Date.now(),
          players: [full("a", 80, { name: "Kévin De Bruyn" }), full("b", 90)],
        },
      ],
    });
    await call("POST", "/v1/db/players", {
      a: "transfer",
      p: 1,
      total: 30,
      players: [
        light("b", { transfer_price: 5000 }),
        light("c", { transfer_price: 7000 }),
      ],
    });
    expect(ids(await call("GET", "/v1/site/players", undefined, true))).toEqual(
      ["b", "c", "a"],
    );
    expect(
      ids(await call("GET", "/v1/site/players?q=kevin", undefined, true)),
    ).toEqual(["a"]);
    expect(
      ids(await call("GET", "/v1/site/players?sort=price", undefined, true)),
    ).toEqual(["b", "c"]);
    const a = (await call("GET", "/v1/site/player/a", undefined, true)).body;
    expect(a).toMatchObject({
      light: false,
      player: { attributes: { vision: 81 } },
    });
    const c = (await call("GET", "/v1/site/player/c", undefined, true)).body;
    expect(c).toMatchObject({ light: true, market: { transferPrice: 7000 } });
    expect(playerSchema.parse(c.player).attributes.sho).toBe(85);
    expect((await call("GET", "/v1/db/stats")).body).toMatchObject({
      transfer: 2,
    });
    expect(
      (await call("GET", "/v1/db/search?q=leger")).body.players.length,
    ).toBe(1);
  });
  it("demande de fiche complète et confiée en priorité", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [light("p1", { club_id: "clubX" })],
    });
    expect(
      (await call("POST", "/v1/site/request/p1", undefined, true)).body.status,
    ).toBe("demande");
    expect(
      (await call("POST", "/v1/assign", { limit: 5, candidates: ["a"] })).body
        .assigned,
    ).toEqual(["clubX", "a"]);
  });
  it("le schéma n’est créé qu’une fois par isolat", async () => {
    const { call } = setup();
    await call("GET", "/v1/site/players", undefined, true);
    const before = t.requests();
    await call("GET", "/v1/site/players", undefined, true);
    expect(t.requests() - before).toBe(1);
  });
  it("loads an entire full player card in three database round trips and a squad in one", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "t1", fetchedAt: Date.now(), players: [full("a")] }],
    });
    let before = t.requests();
    const card = await call("GET", "/v1/site/player/a", undefined, true);
    expect(card.status).toBe(200);
    expect(card.body.player.attributes.vision).toBe(81);
    expect(card.body).toMatchObject({
      prices: [],
      comparables: [],
      history: null,
      light: false,
    });
    expect(t.requests() - before).toBe(3);
    before = t.requests();
    const club = await call("GET", "/v1/site/club/t1", undefined, true);
    expect(club.body.players[0].player.id).toBe("a");
    expect(t.requests() - before).toBe(1);
  });
  it("a new isolate uses the durable migration marker, keeping the data and protocol 2 schema", async () => {
    const { env, call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "t1", fetchedAt: Date.now(), players: [full("a")] }],
    });
    const before = t.requests();
    vi.resetModules();
    const fresh = (await import("../worker.js")).default;
    const response = await fresh.fetch(
      new Request("https://index.test/v1/site/players", {
        headers: { Authorization: "Bearer tok" },
      }),
      env,
    );
    expect((await response.json()).players[0].player.id).toBe("a");
    expect(t.requests() - before).toBe(2);
    expect(
      t.db
        .prepare("PRAGMA table_info(db_pages)")
        .all()
        .some((c) => c.name === "task_id"),
    ).toBe(true);
    expect(
      t.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
    ).toBe(0);
  });
  it("concurrent first reads share initialization instead of running migrations twice", async () => {
    const { call } = setup();
    const statements: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body));
        statements.push(
          ...request.requests.flatMap((r: { stmt?: { sql: string } }) =>
            r.stmt ? [r.stmt.sql] : [],
          ),
        );
        return t.fetchMock(input, init);
      },
    );
    const responses = await Promise.all([
      call("GET", "/v1/site/players", undefined, true),
      call("GET", "/v1/site/players", undefined, true),
    ]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(
      statements.filter((sql) =>
        sql.startsWith("CREATE TABLE IF NOT EXISTS clubs "),
      ),
    ).toHaveLength(1);
  });
  it("a failed migration is retried without a durable success marker", async () => {
    const { call } = setup();
    let fail = true;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          fail &&
          String(init?.body).includes("ALTER TABLE db_pages ADD COLUMN task_id")
        ) {
          fail = false;
          return new Response("temporary unavailable", { status: 503 });
        }
        return t.fetchMock(input, init);
      },
    );
    expect(
      (await call("GET", "/v1/site/players", undefined, true)).status,
    ).toBe(500);
    expect(
      t.db
        .prepare("SELECT v FROM db_meta WHERE k = 'schema:site-perf:v1'")
        .get(),
    ).toBeUndefined();
    expect(
      (await call("GET", "/v1/site/players", undefined, true)).status,
    ).toBe(200);
    expect(
      t.db
        .prepare("SELECT v FROM db_meta WHERE k = 'schema:site-perf:v1'")
        .get()?.v,
    ).toBe("1");
  });
});
