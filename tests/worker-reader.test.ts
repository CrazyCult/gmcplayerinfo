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
  const n = (await mock.DB.prepare("SELECT COUNT(*) AS n FROM db_players").first()).n;
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
  expect(stats.reader.error).toMatch(/connexion du compte lecteur refusée/);
  const n = fetchMock.mock.calls.length;
  await tick(env, Date.parse("2026-11-09T15:02:00Z"));
  expect(fetchMock.mock.calls.length).toBe(n); // en pause
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
    throw new Error("unexpected " + url);
  }));
  const at = Date.parse("2026-11-09T15:01:00Z");
  await tick(env, at); // la base fait connaître le joueur ST-60 (fiche légère)
  const site = (path: string, method = "GET") => worker.fetch(new Request(`https://index.test${path}`, { method, headers: { Authorization: "Bearer tok" } }), env).then(r => r.json());
  const known = (await (mock as any).DB.prepare("SELECT id FROM site_players LIMIT 1").all()).results[0].id as string;
  wanted = known;
  const ask = await site(`/v1/site/request/${known}`, "POST");
  expect(ask.status).toBe("demande");
  order.length = 0;
  await tick(env, at + 60e3);
  expect(order[0]).toBe("fiche"); // la demande passe avant les pages de la base
  const st = await site(`/v1/site/status/${known}`);
  expect(st.light).toBe(false);
  const stats = await (await worker.fetch(new Request("https://index.test/v1/db/stats"), env)).json();
  expect(stats.reader.requestsToday).toBe(1);
});
