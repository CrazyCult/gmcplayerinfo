import { describe, expect, it } from "vitest";
import worker from "../worker.d1.js";
import { d1 } from "./d1-mock";
import { turso } from "./turso-mock";
import { tursoDB } from "../worker.js";
import { vi } from "vitest";
const KEY = "account_key_aaaaaaaaaaaaaaaaaaaa";
function setup() {
  const db = d1();
  const env = { SITE_TOKEN: "test", DB: db.DB };
  const call = async (
    method: string,
    key = KEY,
    body?: unknown,
    token = "test",
  ) =>
    worker.fetch(
      new Request("https://index.test/v1/site/preferences/" + key, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  return { db, call };
}
describe("worker appearance persistence", () => {
  it("persists via the actual Turso HTTP adapter too", async () => {
    const mock = turso();
    vi.stubGlobal("fetch", mock.fetchMock);
    try {
      const env = {
        SITE_TOKEN: "test",
        DB: tursoDB({
          TURSO_URL: "https://turso.test",
          TURSO_TOKEN: "tok-turso",
        }),
      };
      const call = (method: string, body?: unknown) =>
        worker.fetch(
          new Request("https://index.test/v1/site/preferences/" + KEY, {
            method,
            headers: {
              Authorization: "Bearer test",
              "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
          env,
        );
      expect((await call("PUT", { appearance: "manga" })).status).toBe(200);
      expect(await (await call("GET")).json()).toEqual({ appearance: "manga" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("persists, updates, isolates accounts and removes only the preference", async () => {
    const { db, call } = setup();
    expect(await (await call("GET")).json()).toEqual({ appearance: null });
    for (const appearance of ["manga", "light", "dark"]) {
      expect((await call("PUT", KEY, { appearance })).status).toBe(200);
      expect(await (await call("GET")).json()).toEqual({ appearance });
    }
    expect(
      await (await call("GET", "account_key_bbbbbbbbbbbbbbbbbbbb")).json(),
    ).toEqual({ appearance: null });
    db.db
      .prepare("INSERT INTO site_users(k,team_id,updated_at) VALUES (?,?,?)")
      .run(KEY, "club-a", 0);
    expect((await call("PUT", KEY, { appearance: null })).status).toBe(200);
    expect(await (await call("GET")).json()).toEqual({ appearance: null });
    expect(
      db.db.prepare("SELECT team_id FROM site_users WHERE k=?").get(KEY),
    ).toEqual({ team_id: "club-a" });
  });
  it("keeps appearance independent of club unlinking", async () => {
    const { db, call } = setup();
    await call("PUT", KEY, { appearance: "manga" });
    db.db.prepare("DELETE FROM site_users").run();
    expect(await (await call("GET")).json()).toEqual({ appearance: "manga" });
  });
  it("rejects unauthorised reads and writes", async () => {
    const { call } = setup();
    expect((await call("GET", KEY, undefined, "wrong")).status).toBe(401);
    expect(
      (await call("PUT", KEY, { appearance: "manga" }, "wrong")).status,
    ).toBe(401);
  });
  it("rejects invalid keys, methods and preference values", async () => {
    const { call } = setup();
    expect((await call("GET", "x")).status).toBe(400);
    expect((await call("POST")).status).toBe(405);
    for (const appearance of ["classic", 12, {}, undefined])
      expect((await call("PUT", KEY, { appearance })).status).toBe(400);
  });
});
