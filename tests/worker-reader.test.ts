import { afterEach, expect, it, vi } from "vitest";
import worker from "../worker.d1.js";
import { sessionCookie } from "../worker.bot.js";
import { d1 } from "./d1-mock";

const SUPA = "https://teffakezggfkrlcdlaox.supabase.co";
function setup() {
  const mock = d1();
  const env = {
    SITE_TOKEN: "tok", DB: mock.DB,
    GC_BOT_EMAIL: "lecteur@example.test", GC_BOT_PASSWORD: "secret-pass",
    GC_SUPABASE_URL: SUPA, GC_SUPABASE_ANON: "anon-key", READER_GAP_MS: 0,
  };
  return { mock, env };
}
async function tick(env: Record<string, unknown>, at: number) {
  const jobs: Promise<unknown>[] = [];
  await worker.scheduled({ scheduledTime: at }, env, { waitUntil: (p: Promise<unknown>) => jobs.push(p) });
  await Promise.all(jobs);
}
const player = (id: string, position: string, overall: number) => ({
  id, name: `P ${id}`, position, age: 17, overall, potential: 101, value: 1000, club_id: "c1", club_name: "Club 1",
  nationality: "France", flag_code: "FR", free_agent: false, transfer_price: null, loan_fee: null,
  traits: ["Wonderkid"], attributes: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60 }, portrait_url: null,
});
afterEach(() => vi.unstubAllGlobals());

it("reads assigned database pages with the reader account and stores them like an extension", async () => {
  const { env, mock } = setup();
  const calls: { url: string; cookie?: string | null }[] = [];
  let gameStatus = 200, logins = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA + "/auth/v1/token")) {
      logins++;
      expect(new Headers(init.headers).get("apikey")).toBe("anon-key");
      if (env.GC_BOT_PASSWORD === "wrong") return new Response('{"error":"invalid_grant"}', { status: 400 });
      return Response.json({ access_token: "AT-" + logins, refresh_token: "RT", expires_in: 3600, token_type: "bearer", user: { id: "u1", email: "x" } });
    }
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      calls.push({ url, cookie: new Headers(init.headers).get("Cookie") });
      if (gameStatus !== 200) return new Response("{}", { status: gameStatus, headers: { "content-type": "application/json" } });
      const q = new URL(url).searchParams;
      expect(q.get("availability")).toMatch(/^(all|transfer|loan)$/);
      const pos = q.get("position") || "ST", min = +(q.get("minOvr") || 60);
      const players = q.get("availability") === "all" ? [player(`${pos}-${min}`, pos, min)] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    throw new Error("unexpected " + url);
  }));
  const at = Date.parse("2026-11-09T15:01:00Z");
  await tick(env, at);
  expect(logins).toBe(1);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.length).toBeLessThanOrEqual(5);
  // Session présentée comme le cookie @supabase/ssr
  const cookie = calls[0].cookie || "";
  expect(cookie).toContain("sb-teffakezggfkrlcdlaox-auth-token");
  const value = cookie.split("; ").map(c => c.slice(c.indexOf("=") + 1)).join("");
  expect(JSON.parse(atob(value.slice(7).replace(/-/g, "+").replace(/_/g, "/"))).access_token).toBe("AT-1");
  // Joueurs stockés, état visible dans les statistiques, sans la session
  const n = (await mock.DB.prepare("SELECT COUNT(*) AS n FROM db_players").first())!.n;
  expect(n).toBeGreaterThan(0);
  const stats = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(stats.reader.ok).toBe(true);
  expect(stats.reader.pagesToday).toBeGreaterThan(0);
  expect(JSON.stringify(stats)).not.toContain("AT-1");
  expect(JSON.stringify(stats)).not.toContain("RT");
  // Deuxième passage : la session est réutilisée (pas de nouvelle connexion)
  await tick(env, at + 60e3);
  expect(logins).toBe(1);
  // 429 : pause d'une heure, plus aucune lecture pendant ce temps
  gameStatus = 429;
  const before = calls.length;
  await tick(env, at + 120e3);
  expect(calls.length).toBe(before + 1);
  await tick(env, at + 180e3);
  expect(calls.length).toBe(before + 1);
  const st = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(st.reader.error).toMatch(/ralentir/);
});

it("pauses when the reader account cannot log in, and stays off without configuration", async () => {
  const { env } = setup();
  env.GC_BOT_PASSWORD = "wrong";
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return new Response('{"error":"invalid_grant"}', { status: 400 });
    throw new Error("game must not be called: " + url);
  });
  vi.stubGlobal("fetch", fetchMock);
  await tick(env, Date.parse("2026-11-09T15:01:00Z"));
  const stats = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(stats.reader.error).toMatch(/e-mail ou mot de passe/);
  const n = fetchMock.mock.calls.length;
  await tick(env, Date.parse("2026-11-09T15:02:00Z"));
  expect(fetchMock.mock.calls.length).toBe(n); // en pause
  // Mauvaise clé anon : Supabase répond 401 « Invalid API key ».
  env.GC_SUPABASE_ANON = "bad-key";
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." }, { status: 401 })));
  await tick(env, Date.parse("2026-11-09T15:03:00Z")); // clé changée : la pause est levée
  const s1 = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(s1.reader.error).toMatch(/GC_SUPABASE_ANON/);
  const { env: off } = setup();
  delete (off as Record<string, unknown>).GC_BOT_EMAIL;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no fetch expected"); }));
  await tick(off, Date.parse("2026-11-09T15:03:00Z"));
  const s2 = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), off)).json();
  expect(s2.reader).toBe(null);
});

it("splits long sessions into cookie chunks like @supabase/ssr", () => {
  const big = { access_token: "x".repeat(4000), refresh_token: "r" };
  const c = sessionCookie("abc", big);
  expect(c).toMatch(/^sb-abc-auth-token\.0=base64-/);
  expect(c).toContain("; sb-abc-auth-token.1=");
  expect(sessionCookie("abc", { access_token: "a" })).toMatch(/^sb-abc-auth-token=base64-/);
});

it("serves site requests (player sheets) before database pages", async () => {
  const { env, mock } = setup();
  const order: string[] = [];
  let wanted = "";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.startsWith("https://gamechase.io/gamev2/players/")) {
      order.push("fiche");
      expect(new Headers(init.headers).get("RSC")).toBe("1");
      expect(url).toContain("/gamev2/players/" + wanted);
      const full = { ...player(wanted, wanted.split("-")[0], +wanted.split("-")[1]), attributes: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60, finishing: 72 },
        contract_pending: true, contract_deadline: "2026-11-12T23:00:00Z", last_age_up_date: "2026-10-20T07:15:00Z" };
      return new Response(`0:["$","div",null]\n1:{"initialPlayer":${JSON.stringify(full)},"x":1}`, { headers: { "content-type": "text/x-component" } });
    }
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      order.push("base");
      const q = new URL(url).searchParams, pos = q.get("position") || "ST", min = +(q.get("minOvr") || 60);
      const players = q.get("availability") === "all" ? [player(`${pos}-${min}`, pos, min)] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    if (/\/api\/players\/[^/?]+$/.test(url) && !url.includes("database")) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    throw new Error("unexpected " + url);
  }));
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  await tick(env, at); // la base fait connaître le joueur ST-60 (fiche légère)
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const known = (await (mock as any).DB.prepare("SELECT id FROM site_players LIMIT 1").all()).results[0].id as string;
  wanted = known;
  const ask = await site(`/v1/site/request/${known}`, "POST");
  expect(ask.status).toBe("demande");
  order.length = 0;
  vi.setSystemTime(at + 60e3);
  await tick(env, at + 60e3);
  expect(order[0]).toBe("fiche"); // la demande passe avant les pages de la base
  const st = await site(`/v1/site/status/${known}`);
  expect(st.light).toBe(false);
  const stats = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(stats.reader.requestsToday).toBe(1);
  // Fiche complète : relecture sur demande, au plus toutes les 10 min.
  vi.setSystemTime(at + 5 * 60e3);
  expect((await site(`/v1/site/request/${known}`, "POST")).status).toBe("recent");
  vi.setSystemTime(at + 12 * 60e3);
  const again = await site(`/v1/site/request/${known}`, "POST");
  expect(again).toMatchObject({ light: false, status: "demande" });
  expect((await site(`/v1/site/status/${known}`)).requestedAt).toBe(again.requestedAt);
  order.length = 0;
  await tick(env, at + 12 * 60e3 + 1000);
  expect(order[0]).toBe("fiche");
  const done = await site(`/v1/site/status/${known}`);
  expect(done.requestedAt).toBe(null);
  expect(done.fetchedAt).toBeGreaterThanOrEqual(again.requestedAt);
  vi.useRealTimers();
});

it("rereads a whole squad on request (« Mon effectif ») before database pages", async () => {
  const { env } = setup();
  const order: string[] = [];
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.startsWith("https://gamechase.io/gamev2/club/")) {
      order.push("club");
      expect(url).toContain("/gamev2/club/c1");
      expect(new Headers(init.headers).get("RSC")).toBe("1");
      const squad = [player("A-70", "ST", 70), player("B-71", "CM", 71)].map(p => ({ ...p, attributes: { ...p.attributes, finishing: 75 } }));
      return new Response(`0:["$"]\n1:{"club":{"id":"c1"},"players":${JSON.stringify(squad)}}`, { headers: { "content-type": "text/x-component" } });
    }
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      order.push("base");
      const q = new URL(url).searchParams, pos = q.get("position") || "ST", min = +(q.get("minOvr") || 60);
      const players = q.get("availability") === "all" ? [player(`${pos}-${min}`, pos, min)] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    throw new Error("unexpected " + url);
  }));
  await tick(env, at); // la base fait connaître le club c1
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const ask = await site("/v1/site/club/c1", "POST");
  expect(ask.status).toBe("demande");
  order.length = 0;
  vi.setSystemTime(at + 60e3);
  await tick(env, at + 60e3);
  expect(order[0]).toBe("club");
  const club = await site("/v1/site/club/c1");
  expect(club.fetchedAt).toBeGreaterThanOrEqual(ask.requestedAt);
  expect(club.requestedAt).toBe(null);
  expect(club.players.map((p: { player: { id: string } }) => p.player.id).sort()).toEqual(["A-70", "B-71"]);
  // Demande suivante (11 min plus tard) : servie tout de suite, sans attendre la minute.
  vi.setSystemTime(at + 12 * 60e3);
  order.length = 0;
  const jobs: Promise<unknown>[] = [];
  const res = await worker.fetch(new Request("https://index.test/v1/site/club/c1", { method: "POST", headers: { Authorization: "Bearer tok" } }), env,
    { waitUntil: (p: Promise<unknown>) => jobs.push(p) });
  const again = await res.json();
  expect(again.status).toBe("demande");
  await Promise.all(jobs);
  expect(order).toEqual(["club"]); // lu aussitôt, sans page de la base
  expect((await site("/v1/site/club/c1")).fetchedAt).toBeGreaterThanOrEqual(again.requestedAt);
  vi.useRealTimers();
});

it("takes over a site request left by an extension for more than 90 s", async () => {
  const { env, mock } = setup();
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  const db = (mock as any).DB;
  await worker.fetch(new Request("https://index.test/v1/db/stats"), env); // crée les tables
  await db.prepare("INSERT INTO site_requests (team_id, player_id, requested_at) VALUES ('c9', NULL, ?1)").bind(at).run();
  await db.prepare("INSERT INTO leases (team_id, leased_until, leased_by) VALUES ('c9', ?1, 'ext-1')").bind(at + 30 * 60e3).run();
  const call = (await import("../worker.d1.js")).internalCall(env);
  expect((await call("/v1/assign", { limit: 2, players: true, requestsOnly: true })).assigned).toEqual([]);
  vi.setSystemTime(at + 91e3);
  expect((await call("/v1/assign", { limit: 2, players: true, requestsOnly: true })).assigned).toEqual(["c9"]);
  vi.useRealTimers();
});

it("follows the game's redirect from /gamev2/club to /gamev3/club", async () => {
  const { env } = setup();
  const seen: string[] = [];
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.includes("/gamev2/club/")) { seen.push("v2"); return new Response(null, { status: 307, headers: { location: "/gamev3/club/c1" } }); }
    if (url.includes("/gamev3/club/")) {
      seen.push("v3");
      // Forme v3 : pas de liste "players", noms de champs différents.
      const row = { id: "A-70", name: "P A-70", ovr: 70, pot: 101, age: 17, pos: "ST", club_id: "c1", stats: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60 } };
      const other = { id: "Z-90", name: "Rival", ovr: 90, pot: 95, age: 25, club_id: "c2", stats: { pac: 90 } };
      return new Response(`0:["$"]\n5:{"squad":{"rows":[${JSON.stringify(row)}]},"fixtures":[{"star":${JSON.stringify(other)}}]}\n`, { headers: { "content-type": "text/x-component" } });
    }
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      const q = new URL(url).searchParams, pos = q.get("position") || "ST", min = +(q.get("minOvr") || 60);
      const players = q.get("availability") === "all" ? [player(`${pos}-${min}`, pos, min)] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    throw new Error("unexpected " + url);
  }));
  await tick(env, at);
  const res = await worker.fetch(new Request("https://index.test/v1/site/club/c1", { method: "POST", headers: { Authorization: "Bearer tok" } }), env);
  expect((await res.json()).status).toBe("demande");
  vi.setSystemTime(at + 60e3);
  await tick(env, at + 60e3);
  expect(seen).toEqual(["v2", "v3"]);
  const club = await (await worker.fetch(new Request("https://index.test/v1/site/club/c1", { headers: { Authorization: "Bearer tok" } }), env)).json();
  expect(club.fetchedAt).toBeGreaterThan(at);
  expect(club.players.map((p: { player: { id: string; overall: number } }) => [p.player.id, p.player.overall])).toEqual([["A-70", 70]]);
  vi.useRealTimers();
});

it("falls back to the players API, player by player, when the club page has no data (v3 cards)", async () => {
  const { env, mock } = setup();
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  let api = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.includes("/gamev2/club/")) return new Response(null, { status: 307, headers: { location: "/gamev3/club/c1" } });
    if (url.includes("/gamev3/club/")) return new Response('5:["$","b","pac",{"className":"v3-card-stat","children":97}]\n', { headers: { "content-type": "text/x-component" } });
    if (url.startsWith("https://gamechase.io/api/players/database")) return Response.json({ page: 1, total: 0, pageSize: 24, players: [] });
    const m = /\/api\/players\/([^/?]+)$/.exec(url);
    if (m) { api++; return Response.json({ ...player(m[1], "ST", 80), attributes: { pac: 80, sho: 80, pas: 80, dri: 80, def: 40, phy: 70, finishing: 81 } }); }
    throw new Error("unexpected " + url);
  }));
  await worker.fetch(new Request("https://index.test/v1/db/stats"), env); // crée les tables
  const db = (mock as any).DB;
  for (let i = 0; i < 15; i++) {
    const p = player(`K-${i}`, "ST", 60 + i);
    await db.prepare(`INSERT INTO site_players (id, team_id, light, name, name_norm, last_norm, position, age, overall, potential) VALUES (?1, 'c1', 1, ?2, ?3, ?3, 'ST', 17, ?4, 101)`).bind(p.id, p.name, p.name.toLowerCase(), p.overall).run();
    await db.prepare(`INSERT INTO db_players (id, name, name_norm, position, age, overall, potential, value, club_id, club_name, attrs, seen_at) VALUES (?1, ?2, ?3, 'ST', 17, ?4, 101, 1000, 'c1', 'Club 1', ?5, ?6)`).bind(p.id, p.name, p.name.toLowerCase(), p.overall, JSON.stringify(p.attributes), at).run();
  }
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const first = await site("/v1/site/club/c1");
  const known = first.players.length;
  expect(known).toBeGreaterThan(12);
  const ask = await site("/v1/site/club/c1", "POST");
  expect(["demande", "deja-demande"]).toContain(ask.status); // la simple visite demande déjà un club sans instantané
  api = 0;
  vi.setSystemTime(at + 10 * 60e3);
  await tick(env, at + 10 * 60e3);
  expect(api).toBe(12); // 12 fiches par passage
  expect((await site("/v1/site/club/c1")).fetchedAt).toBe(null);
  vi.setSystemTime(at + 12 * 60e3); // reprise de la demande (plus de 90 s)
  await tick(env, at + 12 * 60e3);
  const club = await site("/v1/site/club/c1");
  expect(club.fetchedAt).toBeGreaterThanOrEqual(ask.requestedAt);
  expect(club.players).toHaveLength(known);
  expect(club.players.every((p: { light: boolean; player: { overall: number } }) => !p.light && p.player.overall === 80)).toBe(true);
  vi.useRealTimers();
});

it("keeps a 71-player squad and trims heavy fields to fit the server limit", async () => {
  const { env } = setup();
  const at = Date.parse("2026-11-09T15:01:00Z");
  vi.setSystemTime(at);
  const squad = Array.from({ length: 71 }, (_, i) => ({ ...player(`S-${i}`, "ST", 70), card_url: "https://x.test/" + "c".repeat(7000),
    match_history: [{ id: "m", rating: 7 }], attributes: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60, finishing: 72 } }));
  expect(JSON.stringify(squad).length).toBeGreaterThan(450000);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.includes("/gamev2/club/")) return new Response(`1:{"players":${JSON.stringify(squad)}}`, { headers: { "content-type": "text/x-component" } });
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      const q = new URL(url).searchParams;
      const players = q.get("availability") === "all" ? [player("S-0", q.get("position") || "ST", +(q.get("minOvr") || 60))] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    throw new Error("unexpected " + url);
  }));
  await tick(env, at);
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const ask = await site("/v1/site/club/c1", "POST");
  vi.setSystemTime(at + 60e3);
  await tick(env, at + 60e3);
  const club = await site("/v1/site/club/c1");
  expect(club.fetchedAt).toBeGreaterThanOrEqual(ask.requestedAt);
  expect(club.players).toHaveLength(71);
  expect(club.players[0].player.attributes.finishing).toBe(72);
  vi.useRealTimers();
});

it("keeps the last birthday date in the public squad (colonne « Âge +1 »)", async () => {
  const { publicPlayer } = await import("../worker.d1.js");
  const p = publicPlayer({ data: { ...player("A-1", "ST", 70), last_age_up_date: "2026-10-20T07:15:40Z", mint_address: "x" }, team_id: "c1" });
  expect(p.last_age_up_date).toBe("2026-10-20T07:15:40Z");
  expect(p.mint_address).toBeUndefined();
});

it("relays the game's own market alert (reader account) to Discord", async () => {
  const { env, mock } = setup();
  (env as Record<string, unknown>).ALERT_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_1";
  const at = Date.parse("2026-11-11T09:00:00Z");
  vi.setSystemTime(at);
  const PID = "ba03ce3b-ddb0-49b0-96e9-aa819be374c6", PID2 = "42218ecd-54d2-4c98-b0fd-369c0039f81b";
  const N = (id: number, playerId: string, listingId: string, t: number) => ({ id, activity_type: "transfer_search_match", created_at: new Date(t).toISOString(), metadata: { playerId, listingId } });
  let notifs: unknown[] = [{ id: 9, activity_type: "scouting", created_at: new Date(at).toISOString(), metadata: {} }, N(8, PID, "L1", at - 5 * 60e3), N(3, PID2, "L0", at - 2 * 3600e3)];
  const posts: { embeds: { title: string; url: string; fields: { name: string; value: string }[] }[] }[] = [];
  let discordStatus = 204;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url === "https://gamechase.io/api/notifications") { expect(init.method ?? "GET").toBe("GET"); expect(new Headers(init.headers).get("Cookie")).toContain("sb-"); return Response.json({ notifications: notifs }); }
    if (url.startsWith("https://gamechase.io/api/transfers/listings")) return Response.json({ listings: [{ id: "L1", price_gmc2: 250000, seller_club_name: "FC Test", player: { id: PID, name: "Jean Test", position: "CF", age: 17, overall: 70, potential: 101, value: 300000 } }] });
    if (url.startsWith("https://discord.com/api/webhooks/")) { if (discordStatus < 300) posts.push(JSON.parse(String(init.body))); return new Response(null, { status: discordStatus }); }
    if (url.startsWith("https://gamechase.io/api/players/database")) return Response.json({ page: 1, total: 0, pageSize: 24, players: [] });
    throw new Error("unexpected " + url);
  }));
  await tick(env, at);
  expect(posts).toHaveLength(1);
  expect(posts[0].embeds).toHaveLength(1); // l'alerte de 2 h n'est pas relayée au premier passage
  expect(posts[0].embeds[0].title).toContain("Jean Test");
  expect(posts[0].embeds[0].url).toBe("https://gamechase.io/gamev2/transfers?playerId=" + PID);
  expect(posts[0].embeds[0].fields.find(f => f.name === "Prix")!.value).toContain("250 000");
  vi.setSystemTime(at + 60e3);
  await tick(env, at + 60e3);
  expect(posts).toHaveLength(1); // pas de doublon
  // Discord en panne : l'alerte est gardée et repart au passage suivant.
  await (mock as any).DB.prepare("INSERT INTO db_players (id, name, name_norm, position, age, overall, potential, value, club_id, club_name, attrs, seen_at) VALUES (?1, 'Paul Base', 'paul base', 'GK', 16, 66, 105, 1000, 'c2', 'Club 2', '{}', ?2)").bind(PID2, at).run();
  notifs = [N(12, PID2, "L9", at + 100e3), ...notifs];
  discordStatus = 500;
  vi.setSystemTime(at + 120e3);
  await tick(env, at + 120e3);
  expect(posts).toHaveLength(1);
  discordStatus = 204;
  vi.setSystemTime(at + 180e3);
  await tick(env, at + 180e3);
  expect(posts).toHaveLength(2);
  expect(posts[1].embeds[0].title).toContain("Paul Base"); // absent du marché : fiche prise dans la base
  const stats = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(stats.reader.alerts).toMatchObject({ sentToday: 2, error: "" });
  vi.useRealTimers();
});

it("adds a player unknown to the index from its game id (just packed)", async () => {
  const { env } = setup();
  const NEW = "9fd0410e-2ff6-450e-85f1-de0b358592c7", GHOST = "11111111-2222-4333-8444-555555555555";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url === `https://gamechase.io/api/players/${NEW}`)
      return Response.json({ ...player(NEW, "ST", 66), name: "Nouveau Packé", attributes: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60, finishing: 72 } });
    if (url.startsWith("https://gamechase.io/api/players/database")) return Response.json({ page: 1, total: 0, pageSize: 24, players: [] });
    if (url.includes(GHOST)) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    throw new Error("unexpected " + url);
  }));
  const at = Date.parse("2026-11-11T20:00:00Z");
  vi.setSystemTime(at);
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env);
  expect((await site(`/v1/site/status/${NEW}`)).status).toBe(404);
  expect((await site(`/v1/site/request/pas-un-identifiant`, "POST")).status).toBe(404);
  const ask = await (await site(`/v1/site/request/${NEW}`, "POST")).json();
  expect(ask).toMatchObject({ light: true, unknown: true, status: "demande" });
  expect((await (await site(`/v1/site/request/${NEW}`, "POST")).json()).status).toBe("deja-demande");
  await tick(env, at + 60e3);
  expect((await (await site(`/v1/site/status/${NEW}`)).json()).light).toBe(false);
  const sheet = await (await site(`/v1/site/player/${NEW}`)).json();
  expect(sheet.player.name).toBe("Nouveau Packé");
  // Identifiant que le jeu ne connaît pas : demande retirée, le site voit 404.
  await site(`/v1/site/request/${GHOST}`, "POST");
  expect((await site(`/v1/site/status/${GHOST}`)).status).toBe(200);
  await tick(env, at + 120e3);
  expect((await site(`/v1/site/status/${GHOST}`)).status).toBe(404);
  vi.useRealTimers();
});

it("filters the catalogue by nationality and lists the known nationalities", async () => {
  const { env } = setup();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SUPA)) return Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u" } });
    if (url.startsWith("https://gamechase.io/api/players/database")) {
      const q = new URL(url).searchParams, pos = q.get("position") || "ST", min = +(q.get("minOvr") || 60);
      const players = q.get("availability") === "all" ? [{ ...player(`${pos}-${min}`, pos, min), nationality: pos === "GK" ? "Norway" : "France" }] : [];
      return Response.json({ page: 1, total: players.length, pageSize: 24, players });
    }
    throw new Error("unexpected " + url);
  }));
  const at = Date.parse("2026-11-09T15:01:00Z");
  for (let i = 0; i < 6; i++) await tick(env, at + i * 60e3);
  const site = (path: string) => worker.fetch(new Request(`https://index.test${path}`, { headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const all = await site("/v1/site/players");
  const { nationalities } = await site("/v1/site/nationalities");
  expect(nationalities.reduce((s: number, n: { n: number }) => s + n.n, 0)).toBe(all.total);
  const first = nationalities[0];
  const some = await site(`/v1/site/players?nat=${encodeURIComponent(first.name)}`);
  expect(some.total).toBe(first.n);
  expect((await site("/v1/site/players?nat=Atlantide")).total).toBe(0);
});

it("flags a loaned-out player in the public sheet, whatever form the game uses", async () => {
  const { publicPlayer } = await import("../worker.d1.js");
  const row = (extra: object) => ({ team_id: "T", data: { ...player("P", "ST", 70), ...extra } });
  expect(publicPlayer(row({})).onLoan).toBeUndefined();
  expect(publicPlayer(row({ active_loan: {} })).onLoan).toBeUndefined();
  expect(publicPlayer(row({ active_loan: null })).onLoan).toBeUndefined();
  expect(publicPlayer(row({ active_loan: { id: "L", to_club_id: "X" } })).onLoan).toBe(true);
  expect(publicPlayer(row({ on_loan: true })).onLoan).toBe(true);
  expect(publicPlayer(row({ onLoan: true })).onLoan).toBe(true);
});
