import { DatabaseSync } from "node:sqlite";

/** D1 minimal sur SQLite (node:sqlite) : prepare/bind/run/all/first/batch + meta.changes. */
export function d1() {
  const db = new DatabaseSync(":memory:");
  let reads = 0;
  const statement = (query: string) => {
    let args: unknown[] = [];
    const s = {
      bind: (...values: unknown[]) => ((args = values), s),
      run: async () => {
        const r = db.prepare(query).run(...(args as never[]));
        return {
          meta: { changes: Number(r.changes), rows_written: Number(r.changes) },
        };
      },
      all: async () => {
        const results = db.prepare(query).all(...(args as never[]));
        reads += results.length;
        return { results };
      },
      first: async () => {
        reads += 1;
        return db.prepare(query).get(...(args as never[])) ?? null;
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
