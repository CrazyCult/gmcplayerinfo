import { DatabaseSync } from "node:sqlite";
import { sqliteBindings } from "./sqlite-bindings";

type Arg = { type: string; value?: string | number; base64?: string };
const value = (a: Arg) =>
  a.type === "null"
    ? null
    : a.type === "integer"
      ? Number(a.value)
      : a.type === "float"
        ? Number(a.value)
        : a.value;
const cell = (v: unknown) =>
  v === null || v === undefined
    ? { type: "null" }
    : typeof v === "number"
      ? Number.isInteger(v)
        ? { type: "integer", value: String(v) }
        : { type: "float", value: v }
      : typeof v === "bigint"
        ? { type: "integer", value: v.toString() }
        : { type: "text", value: String(v) };

/** Turso simulé : API HTTP /v2/pipeline sur SQLite (node:sqlite). */
export function turso(token = "tok-turso") {
  const db = new DatabaseSync(":memory:");
  let requests = 0;
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname !== "/v2/pipeline")
      return new Response("not found", { status: 404 });
    if (new Headers(init?.headers).get("Authorization") !== `Bearer ${token}`)
      return new Response("unauthorized", { status: 401 });
    requests++;
    const body = JSON.parse(String(init?.body)) as {
      requests: { type: string; stmt?: { sql: string; args: Arg[] } }[];
    };
    const results = body.requests.map((r) => {
      if (r.type === "close")
        return { type: "ok", response: { type: "close" } };
      try {
        const st = db.prepare(r.stmt!.sql);
        const args = sqliteBindings(r.stmt!.sql, r.stmt!.args.map(value));
        const cols = st
          .columns()
          .map((c) => ({ name: c.name, decltype: null }));
        if (cols.length) {
          const rows = st.all(...args) as Record<string, unknown>[];
          return {
            type: "ok",
            response: {
              type: "execute",
              result: {
                cols,
                rows: rows.map((row) => cols.map((c) => cell(row[c.name]))),
                affected_row_count: 0,
                rows_read: rows.length,
                rows_written: 0,
              },
            },
          };
        }
        const info = st.run(...args);
        return {
          type: "ok",
          response: {
            type: "execute",
            result: {
              cols: [],
              rows: [],
              affected_row_count: Number(info.changes),
              rows_read: 0,
              rows_written: Number(info.changes),
            },
          },
        };
      } catch (error) {
        return { type: "error", error: { message: (error as Error).message } };
      }
    });
    return new Response(JSON.stringify({ baton: null, results }), {
      status: 200,
    });
  };
  return { db, fetchMock, requests: () => requests };
}
