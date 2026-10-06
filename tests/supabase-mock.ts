import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/** Supabase simulé : PostgreSQL (PGlite) + l'appel RPC de PostgREST. */
export async function supabase() {
  const db = new PGlite();
  await db.exec(
    readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  );
  const signatures = new Map<string, { names: string[]; types: string[] }>();
  async function signature(fn: string) {
    if (!signatures.has(fn)) {
      const r = await db.query<{ names: string[] | null; types: string[] }>(
        `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
         from pg_proc p where p.proname = $1`,
        [fn],
      );
      if (!r.rows[0]) throw new Error(`fonction inconnue ${fn}`);
      signatures.set(fn, {
        names: r.rows[0].names ?? [],
        types: r.rows[0].types,
      });
    }
    return signatures.get(fn)!;
  }
  const calls: string[] = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const fn = url.pathname.replace("/rest/v1/rpc/", "");
    calls.push(fn);
    const headers = new Headers(init?.headers);
    if (headers.get("apikey") !== "secret")
      return new Response("{}", { status: 401 });
    const args = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;
    const { names, types } = await signature(fn);
    const parts: string[] = [];
    const values: unknown[] = [];
    names.forEach((name, i) => {
      if (!(name in args)) return;
      const v = args[name];
      values.push(
        v === null
          ? null
          : types[i] === "jsonb"
            ? JSON.stringify(v)
            : types[i].endsWith("[]")
              ? `{${(v as string[]).map((x) => `"${String(x).replace(/["\\]/g, "\\$&")}"`).join(",")}}`
              : v,
      );
      parts.push(`${name} => $${values.length}::${types[i]}`);
    });
    try {
      const r = await db.query<{ r: unknown }>(
        `select ${fn}(${parts.join(", ")}) as r`,
        values,
      );
      return new Response(JSON.stringify(r.rows[0]?.r ?? null), {
        status: 200,
      });
    } catch (error) {
      return new Response(String((error as Error).message), { status: 400 });
    }
  };
  return { db, fetchMock, calls };
}
