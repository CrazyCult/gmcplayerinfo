import { describe, expect, it } from "vitest";
import worker from "../worker.d1.js";
import { d1 } from "./d1-mock";

const player = (id: string, extra = {}) => ({
  id,
  name: id,
  position: "CM",
  age: 23,
  overall: 82,
  potential: 90,
  attributes: { pac: 75 },
  ...extra,
});
function setup(extra = {}) {
  const mock = d1();
  const env = { DB: mock.DB, SITE_TOKEN: "test", ...extra };
  const call = async (
    path: string,
    body?: unknown,
    install = "collector-A",
  ) => {
    const response = await worker.fetch(
      new Request(`https://worker.test/v1/db/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "X-GMC-Install": install },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
    return { status: response.status, body: await response.json() };
  };
  const seed = async (a = "s:CM:80:84", p = 1) => {
    await call("stats");
    mock.db.exec("DELETE FROM db_pages");
    mock.db.prepare("INSERT INTO db_pages (a, p) VALUES (?, ?)").run(a, p);
    const result = await call("assign", { protocol: 2, limit: 1 });
    return result.body.tasks[0];
  };
  const body = (
    task: { a: string; p: number; taskId: string },
    players = Array.from({ length: 24 }, (_, i) => player(`p${i}`)),
    total = 24,
  ) => ({
    protocol: 2,
    ...task,
    collectedAt: Date.now(),
    rawCount: players.length,
    players,
    total,
  });
  return { mock, call, seed, body };
}

describe("collector protocol 2", () => {
  it("health exposes the protocol without accessing the database or licence", async () => {
    const response = await worker.fetch(
      new Request("https://worker.test/health"),
      {
        PUBLIC_KEY_JWK: "not-used",
        DB: {
          prepare: () => {
            throw new Error("unexpected DB read");
          },
        },
      },
    );
    expect(await response.json()).toEqual({ ok: true, collectorProtocol: 2 });
  });
  it("never certifies or splits a lease that expires during database writes", async () => {
    for (const total of [24, 900]) {
      const h = setup(),
        task = await h.seed();
      const raced = {
        ...h.mock.DB,
        prepare: (sql: string) => {
          const statement = h.mock.DB.prepare(sql);
          if (!sql.startsWith("UPDATE db_pages SET done_at")) return statement;
          return {
            ...statement,
            bind: (...args: unknown[]) => {
              const bound = statement.bind(...args);
              return {
                ...bound,
                run: async () => {
                  h.mock.db
                    .prepare("UPDATE db_pages SET leased_until = ?")
                      .run(Date.now() - 10000);
                  return bound.run();
                },
              };
            },
          };
        },
      };
      const response = await worker.fetch(
        new Request("https://worker.test/v1/db/players", {
          method: "POST",
          headers: { "X-GMC-Install": "collector-A" },
          body: JSON.stringify(h.body(task, undefined, total)),
        }),
        { DB: raced },
      );
      expect(await response.json()).toMatchObject({
        status: "retry_after",
        pageAcknowledged: false,
      });
      expect(
        h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
      ).toBe(0);
      expect(
        h.mock.db.prepare("SELECT count(*) AS n FROM db_split_receipts").get()
          ?.n,
      ).toBe(0);
    }
  });
  it("provides unique leases and only one concurrent collector obtains each page", async () => {
    const h = setup();
    await h.call("stats");
    h.mock.db.exec("DELETE FROM db_pages");
    h.mock.db
      .prepare("INSERT INTO db_pages (a, p) VALUES (?, 1)")
      .run("transfer");
    const results = await Promise.all([
      h.call("assign", { protocol: 2, limit: 1 }),
      h.call("assign", { protocol: 2, limit: 1 }, "collector-B"),
    ]);
    const tasks = results.flatMap((r) => r.body.tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: expect.any(String),
      leasedUntil: expect.any(Number),
    });
  });
  it("acknowledges all records and certifies exactly the leased page", async () => {
    const h = setup(),
      task = await h.seed();
    const result = await h.call("players", h.body(task));
    expect(result.body).toMatchObject({
      status: "completed",
      accepted: 24,
      rejected: 0,
      pageAcknowledged: true,
    });
    expect(
      h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
    ).toBe(1);
    // Expired/completed token cannot silently confirm a later generation.
    expect((await h.call("players", h.body(task))).body.pageAcknowledged).toBe(
      false,
    );
  });
  it("confirms a genuinely empty first page with total zero", async () => {
    const h = setup(),
      task = await h.seed();
    expect((await h.call("players", h.body(task, [], 0))).body).toMatchObject({
      status: "completed",
      accepted: 0,
      pageAcknowledged: true,
    });
  });
  it("stores passive observations without certifying any page", async () => {
    const h = setup();
    await h.seed();
    const result = await h.call("players", {
      protocol: 2,
      collectedAt: Date.now(),
      players: [player("observed")],
      rawCount: 1,
    });
    expect(result.body).toMatchObject({
      status: "completed",
      accepted: 1,
      pageAcknowledged: false,
    });
    expect(
      h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
    ).toBe(0);
  });
  it("rejects wrong owner, obsolete token and expired lease without confirming or storing", async () => {
    for (const mode of ["owner", "token", "expired"]) {
      const h = setup(),
        task = await h.seed(),
        payload = h.body(task);
      if (mode === "token") payload.taskId = "obsolete";
      if (mode === "expired")
        h.mock.db
          .prepare("UPDATE db_pages SET leased_until = ?")
          .run(Date.now() - 1);
      const result = await h.call(
        "players",
        payload,
        mode === "owner" ? "collector-B" : "collector-A",
      );
      expect(result.body).toMatchObject({
        status: "retry_after",
        accepted: 0,
        pageAcknowledged: false,
      });
      expect(
        h.mock.db.prepare("SELECT count(*) AS n FROM db_players").get()?.n,
      ).toBe(0);
    }
  });
  it("rejects incomplete pages, duplicates, invalid records, bad dates and wrong slice", async () => {
    for (const mode of [
      "count",
      "duplicates",
      "invalid",
      "date",
      "position",
      "ovr",
    ]) {
      const h = setup(),
        task = await h.seed(),
        payload = h.body(task);
      if (mode === "count") payload.rawCount = 2;
      if (mode === "duplicates") payload.players[1] = payload.players[0];
      if (mode === "invalid") payload.players[0].age = 0;
      if (mode === "date") payload.collectedAt = 1;
      if (mode === "position") payload.players[0].position = "ST";
      if (mode === "ovr") payload.players[0].overall = 90;
      const result = await h.call("players", payload);
      expect(result.body.pageAcknowledged).toBe(false);
      expect(
        h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
      ).toBe(0);
    }
  });
  it("requires the exact record count for the final page", async () => {
    const h = setup(),
      task = await h.seed("s:CM:80:84", 2);
    expect(
      (await h.call("players", h.body(task, [player("a")], 26))).body
        .pageAcknowledged,
    ).toBe(false);
    expect(
      (await h.call("players", h.body(task, [player("a"), player("b")], 26)))
        .body.pageAcknowledged,
    ).toBe(true);
  });
  it("splits large slices and acknowledges saved records without certifying their old page", async () => {
    const h = setup(),
      task = await h.seed("s:CM:80:84");
    const result = await h.call("players", h.body(task, undefined, 900));
    expect(result.body).toMatchObject({
      status: "split",
      accepted: 24,
      rejected: 0,
      pageAcknowledged: false,
    });
    expect(
      h.mock.db
        .prepare("SELECT a FROM db_pages ORDER BY a")
        .all()
        .map((r) => r.a),
    ).toEqual(["s:CM:80:82", "s:CM:83:84"]);
    expect(
      h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
    ).toBe(0);
  });
  it("rejects non-market players in a market task", async () => {
    const h = setup(),
      task = await h.seed("transfer");
    expect((await h.call("players", h.body(task))).body.pageAcknowledged).toBe(
      false,
    );
    const players = Array.from({ length: 24 }, (_, i) =>
      player(`sale${i}`, { transfer_price: 100 }),
    );
    expect(
      (await h.call("players", h.body(task, players))).body.pageAcknowledged,
    ).toBe(true);
  });
  it("budget exhaustion never produces a completed acknowledgment", async () => {
    const h = setup({ DAILY_WRITE_BUDGET: "1000" }),
      task = await h.seed();
    h.mock.db
      .prepare(
        "INSERT INTO db_meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      )
      .run(`writes:${new Date().toISOString().slice(0, 10)}`, "5000");
    // The in-memory counter is normally re-read every minute.
    // Start with a new DB adapter object to simulate another isolate.
    const response = await worker.fetch(
      new Request("https://worker.test/v1/db/players", {
        method: "POST",
        headers: { "X-GMC-Install": "collector-A" },
        body: JSON.stringify(h.body(task)),
      }),
      { DB: { ...h.mock.DB }, DAILY_WRITE_BUDGET: "1000" },
    );
    const failure = await response.json();
    expect(failure.pageAcknowledged).toBe(false);
    expect(failure).toMatchObject({
      status: "retry_after",
      paused: true,
      accepted: 0,
    });
    expect(
      h.mock.db.prepare("SELECT count(*) AS n FROM db_page_audits").get()?.n,
    ).toBe(0);
  });
  it("does not trust old cached stats or uncertified historical reads", async () => {
    const h = setup();
    await h.seed();
    h.mock.db.prepare("UPDATE db_pages SET done_at = ?").run(Date.now());
    h.mock.db
      .prepare(
        "INSERT INTO db_meta(k,v) VALUES ('stats',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      )
      .run(
        JSON.stringify({
          at: Date.now(),
          data: { players: 999, pages: [{ a: "all", fresh: 999 }] },
        }),
      );
    // New isolate skips the old format and retains the same database.
    const response = await worker.fetch(
      new Request("https://worker.test/v1/db/stats"),
      { DB: { ...h.mock.DB } },
    );
    const stats = await response.json();
    expect(stats.protocol).toBe(2);
    expect(stats.coverage.globallyVerified).toBe(false);
    expect(stats.pages[0].fresh || 0).toBe(0);
    expect(stats.coverage.slices[0].missingPages).toBe(1);
  });
});
