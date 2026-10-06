// Serveur GMC Companion + API du site GameChase Player Info (Cloudflare Worker).
// Les données sont dans Turso (SQLite hébergé, offre gratuite : 5 Go,
// 500 M lignes lues et 10 M écrites par mois). Toute la logique est dans
// worker.d1.js (écrite pour SQLite) ; ce fichier fournit seulement un
// adaptateur qui donne à Turso l'interface de Cloudflare D1.
import core, { backfillStep, dbPublicPlayer, publicPlayer } from './worker.d1.js';

export { backfillStep, dbPublicPlayer, publicPlayer };

// Valeur JS → argument libSQL (les entiers sont transmis en texte).
function encode(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  if (typeof v === 'bigint') return { type: 'integer', value: v.toString() };
  return { type: 'text', value: String(v) };
}
function decode(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') { const n = Number(cell.value); return Number.isSafeInteger(n) ? n : cell.value; }
  if (cell.type === 'float') return Number(cell.value);
  if (cell.type === 'blob') return cell.base64;
  return cell.value;
}

/** Interface D1 (prepare/bind/first/all/run, batch) sur l'API HTTP de Turso. */
export function tursoDB({ TURSO_URL, TURSO_TOKEN }) {
  const base = String(TURSO_URL || '').replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  if (!base || !TURSO_TOKEN) throw new Error('Turso non configuré (TURSO_URL / TURSO_TOKEN)');
  async function pipeline(stmts) {
    const requests = stmts.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: s.args.map(encode) } }));
    requests.push({ type: 'close' });
    const res = await fetch(`${base}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    if (!res.ok) throw new Error(`Turso : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const { results } = await res.json();
    return stmts.map((_, i) => {
      const r = results[i];
      if (!r || r.type !== 'ok') throw new Error(`Turso : ${(r && r.error && r.error.message) || 'erreur inconnue'}`);
      const out = r.response.result;
      const names = out.cols.map(c => c.name);
      return {
        results: out.rows.map(row => Object.fromEntries(row.map((cell, k) => [names[k], decode(cell)]))),
        meta: { changes: out.affected_row_count || 0, rows_written: out.rows_written ?? out.affected_row_count ?? 0, rows_read: out.rows_read ?? 0 },
      };
    });
  }
  const prepare = (sql) => {
    const stmt = {
      sql, args: [],
      bind: (...values) => Object.assign(Object.create(stmt), { args: values }),
      all: async function () { const [r] = await pipeline([this]); return { results: r.results, meta: r.meta }; },
      first: async function () { const [r] = await pipeline([this]); return r.results[0] ?? null; },
      run: async function () { const [r] = await pipeline([this]); return { meta: r.meta }; },
    };
    return stmt;
  };
  return { url: base, prepare, batch: async (list) => (list.length ? pipeline(list) : []) };
}

// Un seul adaptateur par isolat (le schéma n'est vérifié qu'une fois).
let cached = null;
function withDb(env) {
  if (!env.TURSO_URL) return env; // ancien mode : binding D1
  if (!cached || cached.url !== String(env.TURSO_URL).replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '') || cached.token !== env.TURSO_TOKEN)
    cached = Object.assign(tursoDB(env), { token: env.TURSO_TOKEN });
  return { ...env, DB: cached };
}

export default {
  fetch: (req, env, ctx) => core.fetch(req, withDb(env), ctx),
  scheduled: (event, env, ctx) => core.scheduled(event, withDb(env), ctx),
};
