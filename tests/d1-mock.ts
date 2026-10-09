import { DatabaseSync } from "node:sqlite";
import { sqliteBindings } from "./sqlite-bindings";

/** D1 minimal sur SQLite (node:sqlite) : prepare/bind/run/all/first/batch + meta.changes. */
export function d1() {
  const db = new DatabaseSync(":memory:");
  let reads = 0;
  const statement = (query: string) => {
    let args: unknown[] = [];
    const s = {
      bind: (...values: unknown[]) => ((args = values), s),
      run: async () => {
        const statement = db.prepare(query);
        if (statement.columns().length) {
          const results = statement.all(...sqliteBindings(query, args));
          reads += results.length;
          return { results, meta: { changes: 0, rows_written: 0 } };
        }
        const r = statement.run(...sqliteBindings(query, args));
        return {
          meta: { changes: Number(r.changes), rows_written: Number(r.changes) },
        };
      },
      all: async () => {
        const results = db.prepare(query).all(...sqliteBindings(query, args));
        reads += results.length;
        return { results };
      },
      first: async () => {
        reads += 1;
        return db.prepare(query).get(...sqliteBindings(query, args)) ?? null;
      },
    };
    return s;
  };
  return {
    db,
    reads: () => reads,
    DB: {
      prepare: statement,
      batch: async (list: { run: () => Promise<unknown> }[]) => {
        const out = [];
        for (const item of list) out.push(await item.run());
        return out;
      },
    },
  };
}
