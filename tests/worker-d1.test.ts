import { describe, expect, it, vi } from "vitest";
import worker, {
  backfillStep,
  dbPublicPlayer,
  publicPlayer,
} from "../worker.d1.js";
import { FIELD_SUBS, GK_SUBS } from "../src/types";
import { playerSchema } from "../src/schemas/player";
import { d1 } from "./d1-mock";

function setup(extra: Record<string, unknown> = {}) {
  const mock = d1();
  const env = { SITE_TOKEN: "tok", DB: mock.DB, ...extra };
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
  return { mock, env, call };
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

describe("accès et confidentialité", () => {
  it("refuse l’accès site sans secret, sans toucher à D1", async () => {
    const prepare = vi.fn();
    const response = await worker.fetch(
      new Request("https://index.test/v1/site/players"),
      { DB: { prepare }, PUBLIC_KEY_JWK: "x" },
    );
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("refuse les écritures sur les routes de lecture du site", async () => {
    const { call } = setup();
    expect(
      (await call("POST", "/v1/site/players", undefined, true)).status,
    ).toBe(405);
  });
  it("applique la limitation de débit avant de lire D1", async () => {
    const { call } = setup({
      SITE_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    expect(
      (await call("GET", "/v1/site/players", undefined, true)).status,
    ).toBe(429);
  });
  it("ne publie aucun champ privé et garde tous les attributs du moteur", () => {
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
        attributes: { ...subs, pac: 80, secret: "private" },
      },
    });
    expect(playerSchema.parse(player).attributes.subs).toEqual(subs);
    expect(JSON.stringify(player)).not.toContain("private");
  });
  it("publie une fiche légère compatible avec le schéma", () => {
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
      leased_by: "private",
    });
    const parsed = playerSchema.parse(player);
    expect(parsed.attributes.div).toBe(99);
    expect(parsed.traits).toEqual(["Workhorse"]);
    expect(JSON.stringify(player)).not.toContain("private");
  });
});

describe("catalogue indexé (économie de lectures et d’écritures)", () => {
  it("indexe les effectifs, fusionne la base du jeu, sans doublon", async () => {
    const { call } = setup();
    const now = Date.now();
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "t1",
          fetchedAt: now,
          players: [full("a", 80), full("b", 90)],
        },
      ],
    });
    await call("POST", "/v1/db/players", {
      players: [light("b", { overall: 91, transfer_price: 5000 }), light("c")],
    });
    const all = (await call("GET", "/v1/site/players", undefined, true)).body;
    expect(
      all.players.map((p: { player: { id: string } }) => p.player.id),
    ).toEqual(["b", "c", "a"]);
    const b = all.players[0];
    expect(b.light).toBe(false);
    expect(b.player.overall).toBe(90); // la fiche complète garde ses valeurs
    expect(b.market.transferPrice).toBe(5000); // mais reçoit le prix
    expect(all.players[1].light).toBe(true);
    const sale = (
      await call("GET", "/v1/site/players?sort=price", undefined, true)
    ).body;
    expect(
      sale.players.map((p: { player: { id: string } }) => p.player.id),
    ).toEqual(["b"]);
  });
  it("recherche par début du nom ou du nom de famille", async () => {
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
    const ids = async (q: string) =>
      (
        await call(
          "GET",
          `/v1/site/players?q=${encodeURIComponent(q)}`,
          undefined,
          true,
        )
      ).body.players.map((p: { player: { id: string } }) => p.player.id);
    expect(await ids("kevin")).toEqual(["x"]);
    expect(await ids("bruy")).toEqual(["x"]);
    expect(await ids("Maldino")).toEqual(["y"]);
    expect(await ids("zzz")).toEqual([]);
  });
  it("une fiche ne lit qu’une ligne du catalogue et une ligne de club", async () => {
    const { call, mock } = setup();
    const players = Array.from({ length: 40 }, (_, i) => full(`p${i}`, 60 + i));
    for (let t = 0; t < 30; t++)
      await call("POST", "/v1/clubs", {
        clubs: [
          {
            teamId: `t${t}`,
            fetchedAt: Date.now(),
            players: players.map((p) => ({ ...p, id: `${t}-${p.id}` })),
          },
        ],
      });
    const before = mock.reads();
    const r = await call("GET", "/v1/site/player/12-p5", undefined, true);
    expect(r.status).toBe(200);
    expect(r.body.player.attributes.vision).toBe(81);
    expect(mock.reads() - before).toBeLessThan(10);
  });
  it("ne réécrit rien quand une page ou un club n’a pas changé", async () => {
    const { call, mock } = setup();
    const club = {
      teamId: "t1",
      fetchedAt: Date.now(),
      players: [full("a"), full("b")],
    };
    await call("POST", "/v1/clubs", { clubs: [club] });
    await call("POST", "/v1/db/players", {
      a: "all",
      p: 1,
      total: 48,
      players: [light("c"), light("d")],
    });
    const w = () =>
      Number(
        (
          mock.db
            .prepare("SELECT v FROM db_meta WHERE k LIKE 'writes:%'")
            .get() as { v: string }
        ).v,
      );
    const before = w();
    await call("POST", "/v1/clubs", {
      clubs: [{ ...club, fetchedAt: club.fetchedAt + 1000 }],
    });
    await call("POST", "/v1/db/players", { players: [light("c"), light("d")] });
    expect(w() - before).toBe(1); // seule la ligne du club (nouvelle date) est réécrite
  });
  it("suspend la base complète quand le budget d’écritures du jour est atteint", async () => {
    const { call } = setup({ DAILY_WRITE_BUDGET: "1000" });
    await call("POST", "/v1/db/players", {
      a: "all",
      p: 1,
      total: 48,
      players: [light("c")],
    });
    await call("POST", "/v1/db/players", {
      a: "transfer",
      p: 1,
      total: 24,
      players: [light("t", { transfer_price: 9 })],
    });
    expect(
      (await call("POST", "/v1/db/assign", { limit: 5 })).body.tasks.length,
    ).toBeGreaterThan(0);
    const { mock, call: call2 } = setup({ DAILY_WRITE_BUDGET: "1000" });
    mock.db.exec(
      "CREATE TABLE IF NOT EXISTS db_meta (k TEXT PRIMARY KEY, v TEXT)",
    );
    mock.db
      .prepare("INSERT INTO db_meta VALUES (?, ?)")
      .run(`writes:${new Date().toISOString().slice(0, 10)}`, "5000");
    const r = await call2("POST", "/v1/db/players", {
      a: "all",
      p: 1,
      players: [light("z")],
    });
    expect(r.body.paused).toBe(true);
    const tasks = (await call2("POST", "/v1/db/assign", { limit: 5 })).body;
    expect(tasks.budget).toBe("atteint");
    expect(
      tasks.tasks.every((t: { kind: string }) => t.kind === "market"),
    ).toBe(true);
  });
  it("le rattrapage remplit le catalogue depuis les clubs et la base existants", async () => {
    const { mock, env, call } = setup();
    await call("GET", "/v1/site/players", undefined, true); // crée le schéma
    mock.db
      .prepare("INSERT INTO clubs VALUES (?, ?, ?, ?, ?)")
      .run("old", 1, 1, "x", JSON.stringify([full("o1"), full("o2")]));
    mock.db
      .prepare(
        `INSERT INTO db_players (id, name, name_norm, position, age, overall, potential, club_id, free_agent, attrs, traits, seen_at)
      VALUES ('l1', 'Leger Un', 'leger un', 'ST', 20, 70, 80, 'k', 0, '{}', '[]', 1)`,
      )
      .run();
    for (let i = 0; i < 5; i++) await backfillStep(env);
    const ids = (
      await call("GET", "/v1/site/players", undefined, true)
    ).body.players.map((p: { player: { id: string } }) => p.player.id);
    expect(ids.sort()).toEqual(["l1", "o1", "o2"]);
    expect((await backfillStep(env)).done).toBe(true);
  });
});

describe("demande de fiche complète depuis le site", () => {
  it("anciennes extensions : le club passe en tête, une seule fois", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [light("p1", { club_id: "clubX" })],
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
      (await call("POST", "/v1/assign", { limit: 5, candidates: ["a"] })).body
        .assigned,
    ).toEqual(["clubX", "a"]);
    expect(
      (await call("POST", "/v1/assign", { limit: 5, candidates: ["b"] })).body
        .assigned,
    ).toEqual(["b"]);
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "clubX",
          fetchedAt: Date.now() + 1000,
          players: [full("p1")],
        },
      ],
    });
    expect(
      (await call("GET", "/v1/site/status/p1", undefined, true)).body,
    ).toMatchObject({ light: false, requestedAt: null });
    expect(
      (await call("GET", "/v1/site/player/p1", undefined, true)).body,
    ).toMatchObject({ light: false, player: { attributes: { vision: 81 } } });
  });
  it("extensions 2.31 : fiche lue joueur par joueur, agents libres compris", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [light("free", { free_agent: true, club_id: "sys" })],
    });
    expect(
      (await call("POST", "/v1/site/request/free", undefined, true)).body
        .status,
    ).toBe("demande");
    const a = (
      await call("POST", "/v1/assign", {
        limit: 5,
        candidates: ["c1"],
        players: true,
      })
    ).body;
    expect(a).toEqual({ players: ["free"], assigned: ["c1"] });
    expect(
      (
        await call("POST", "/v1/assign", {
          limit: 5,
          candidates: [],
          players: true,
        })
      ).body.players,
    ).toEqual([]);
    const r = await call("POST", "/v1/players", {
      players: [
        {
          fetchedAt: Date.now(),
          player: full("free", 115, { club_id: "sys" }),
        },
        { fetchedAt: 1, player: { id: "x" } },
      ],
    });
    expect(r.body).toEqual({ accepted: 1, rejected: 1 });
    await call("POST", "/v1/players", {
      players: [
        {
          fetchedAt: Date.now() + 10,
          player: full("free", 115, { club_id: "sys" }),
          history: [
            { date: "2026-10-01", overall: 113 },
            { date: "2026-10-05", overall: 115 },
          ],
        },
      ],
    });
    const page = (await call("GET", "/v1/site/player/free", undefined, true))
      .body;
    expect(page.history).toEqual([
      { date: "2026-10-01", overall: 113 },
      { date: "2026-10-05", overall: 115 },
    ]);
    expect(page).toMatchObject({
      light: false,
      player: { overall: 115, attributes: { vision: 81 } },
      market: { freeAgent: true },
    });
    expect(
      (await call("GET", "/v1/site/status/free", undefined, true)).body,
    ).toMatchObject({ light: false, requestedAt: null });
  });
  it("garde la version la plus récente entre club et fiche seule", async () => {
    const { call } = setup();
    const t = Date.now();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "c", fetchedAt: t - 5000, players: [full("p", 80)] }],
    });
    await call("POST", "/v1/players", {
      players: [{ fetchedAt: t, player: full("p", 82, { club_id: "c" }) }],
    });
    expect(
      (await call("GET", "/v1/site/player/p", undefined, true)).body.player
        .overall,
    ).toBe(82);
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "c", fetchedAt: t + 5000, players: [full("p", 83)] }],
    });
    expect(
      (await call("GET", "/v1/site/player/p", undefined, true)).body.player
        .overall,
    ).toBe(83);
  });
});

describe("Mon effectif : clubs et compte du site", () => {
  const key = "k".repeat(43);
  it("cherche un club par son nom, accents et casse ignorés", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [
        light("p1", { club_id: "c1", club_name: "L’Icaunique" }),
        light("p2", { club_id: "c2", club_name: "Olympique Icaunais" }),
        light("p3", { club_id: "c3", club_name: "Autre" }),
        light("p4", { club_id: "x", club_name: "Stellar", free_agent: true }),
      ],
    });
    const r = await call("GET", "/v1/site/clubs?q=ICAU", undefined, true);
    expect(
      r.body.clubs.map((c: { teamId: string }) => c.teamId).sort(),
    ).toEqual(["c1", "c2"]);
    expect(
      (await call("GET", "/v1/site/clubs?q=stellar", undefined, true)).body
        .clubs,
    ).toEqual([]);
    for (const q of ["l'icaunique", "L’ICAUNIQUE", "licaunique", "icaunique"])
      expect(
        (
          await call(
            "GET",
            `/v1/site/clubs?q=${encodeURIComponent(q)}`,
            undefined,
            true,
          )
        ).body.clubs.map((c: { teamId: string }) => c.teamId),
      ).toContain("c1");
    expect(
      (await call("GET", "/v1/site/clubs?q=a", undefined, true)).body.clubs,
    ).toEqual([]);
  });
  it("remplit les noms depuis le catalogue existant à la première recherche", async () => {
    const { call, mock } = setup();
    await call("POST", "/v1/db/players", {
      players: [light("p1", { club_id: "c1", club_name: "Racing Fox" })],
    });
    await mock.DB.prepare("DELETE FROM site_clubs").run();
    expect(
      (await call("GET", "/v1/site/clubs?q=fox", undefined, true)).body.clubs,
    ).toMatchObject([{ teamId: "c1", name: "Racing Fox" }]);
  });
  it("donne l’effectif complet d’un club connu, sinon les fiches légères, et demande sa lecture", async () => {
    const { call } = setup();
    await call("POST", "/v1/db/players", {
      players: [
        light("p1", { club_id: "c1", club_name: "Fox" }),
        light("p2", { club_id: "c1", club_name: "Fox" }),
      ],
    });
    const lightSquad = await call("GET", "/v1/site/club/c1", undefined, true);
    expect(lightSquad.body).toMatchObject({
      teamId: "c1",
      name: "Fox",
      fetchedAt: null,
    });
    expect(lightSquad.body.players).toHaveLength(2);
    expect(
      lightSquad.body.players.every((p: { light: boolean }) => p.light),
    ).toBe(true);
    expect(lightSquad.body.requestedAt).toBeGreaterThan(0);
    // Une extension récente se voit confier ce club entier.
    expect(
      (
        await call("POST", "/v1/assign", {
          limit: 5,
          players: true,
          candidates: [],
        })
      ).body.assigned,
    ).toEqual(["c1"]);
    await call("POST", "/v1/clubs", {
      clubs: [
        {
          teamId: "c1",
          fetchedAt: Date.now(),
          players: [full("p1"), full("p2"), full("p9")],
        },
      ],
    });
    const fullSquad = await call("GET", "/v1/site/club/c1", undefined, true);
    expect(fullSquad.body.players).toHaveLength(3);
    expect(fullSquad.body.requestedAt).toBeNull();
    expect(
      fullSquad.body.players.every(
        (p: { light: boolean; player: unknown }) =>
          !p.light && playerSchema.safeParse(p.player).success,
      ),
    ).toBe(true);
    expect(
      (await call("GET", "/v1/site/club/inconnu", undefined, true)).status,
    ).toBe(404);
  });
  it("rattache, lit et détache le club d’un compte", async () => {
    const { call } = setup();
    expect(
      (await call("GET", `/v1/site/me/${key}`, undefined, true)).body,
    ).toEqual({ teamId: null });
    expect(
      (await call("PUT", `/v1/site/me/${key}`, { teamId: "c1" }, true)).body,
    ).toEqual({ teamId: "c1" });
    expect(
      (await call("GET", `/v1/site/me/${key}`, undefined, true)).body,
    ).toEqual({ teamId: "c1" });
    expect(
      (await call("PUT", `/v1/site/me/${key}`, { teamId: null }, true)).body,
    ).toEqual({ teamId: null });
    expect(
      (await call("GET", `/v1/site/me/${key}`, undefined, true)).body,
    ).toEqual({ teamId: null });
    expect(
      (await call("GET", "/v1/site/me/court", undefined, true)).status,
    ).toBe(400);
    expect(
      (await call("PUT", `/v1/site/me/${key}`, { teamId: 5 }, true)).status,
    ).toBe(400);
    expect((await call("GET", `/v1/site/me/${key}`)).status).toBe(401);
  });
});

describe("historique d’OVR seul", () => {
  it("enregistre l’historique d’un joueur sans toucher à sa fiche", async () => {
    const { call } = setup();
    await call("POST", "/v1/clubs", {
      clubs: [{ teamId: "c1", fetchedAt: Date.now(), players: [full("p1")] }],
    });
    const history = [
      { overall: 70, recorded_at: "2026-09-01" },
      { overall: 80, recorded_at: "2026-10-01" },
    ];
    const r = await call("POST", "/v1/history", {
      items: [
        { id: "p1", fetchedAt: Date.now(), history },
        { id: "", fetchedAt: Date.now(), history },
        { id: "p2", fetchedAt: Date.now(), history: "x" },
      ],
    });
    expect(r.body).toEqual({ accepted: 1, rejected: 2 });
    const sheet = await call("GET", "/v1/site/player/p1", undefined, true);
    expect(sheet.body.history).toEqual(history);
    expect(sheet.body.player.attributes).toMatchObject({ vision: 81 });
  });
});
