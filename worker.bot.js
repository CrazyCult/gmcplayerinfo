// Compte lecteur : un compte GameChase dédié, utilisé par le serveur pour lire
// la base des joueurs (/api/players/database) 24h/24, sans extension ouverte.
//
// - Lecture seule : uniquement des GET sur l'API du jeu. Aucune action en jeu.
// - Identifiants dans les secrets Cloudflare (GC_BOT_EMAIL, GC_BOT_PASSWORD),
//   jamais dans le code ni dans la base. Seule la session (jetons renouvelables
//   du compte lecteur) est gardée côté serveur, dans db_meta, jamais renvoyée.
// - Priorité aux demandes du site (fiches de joueurs, effectifs « Mon effectif »
//   et clubs des utilisateurs : /v1/assign), puis la base complète.
// - Même chemin que les extensions : le compte lecteur réserve des pages
//   (/v1/db/assign) puis les envoie (/v1/db/players), avec les mêmes contrôles.
// - Prudence : 4 pages par minute au plus (READER_PAGES), 1,5 s entre deux ; pause automatique sur 401 répétés
//   (6 h), 429 (1 h), 403 (24 h : compte peut-être bloqué).
//
// Le jeu lit la session dans le cookie Supabase (pas dans l'en-tête
// Authorization, vérifié le 09/11/2026) : on le reconstruit comme @supabase/ssr.

const GAME = 'https://gamechase.io';
// 4 pages par passage : ~35 sous-requêtes (jeu + Turso) sur les 50 du plan gratuit.
const PAGES_PER_RUN = 4;
const GAP_MS = 1500;                // entre deux pages du jeu
const COOKIE_CHUNK = 3180;          // taille des morceaux de cookie de @supabase/ssr
const PAUSE = { auth: 6 * 3600e3, rate: 3600e3, forbidden: 24 * 3600e3, login: 10 * 60e3 };
const DB_KEEP = ['id', 'name', 'position', 'age', 'overall', 'potential', 'value', 'club_id', 'club_name', 'nationality', 'flag_code',
  'free_agent', 'transfer_price', 'loan_fee', 'traits', 'attributes', 'portrait_url'];

export const botConfigured = (env) => !!(env.GC_BOT_EMAIL && env.GC_BOT_PASSWORD && env.GC_SUPABASE_URL && env.GC_SUPABASE_ANON);

const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ref = (env) => new URL(env.GC_SUPABASE_URL).hostname.split('.')[0];

async function meta(env, k) {
  const r = await env.DB.prepare('SELECT v FROM db_meta WHERE k = ?1').bind(k).first();
  if (!r) return null;
  try { return JSON.parse(r.v); } catch (_) { return null; }
}
const setMeta = (env, k, v) => env.DB.prepare('INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
  .bind(k, JSON.stringify(v)).run();

// --- Session Supabase du compte lecteur ---------------------------------------------
let lastAuthError = null;
// Message lisible pour un refus de connexion.
function loginError(e) {
  const why = (e && e.why || '').toLowerCase();
  if (e && e.status === 401 && /api ?key|apikey|no api key/.test(why)) return 'clé GC_SUPABASE_ANON refusée par Supabase (clé incomplète ou erronée)';
  if (e && e.status === 401) return 'Supabase refuse la requête (401 : vérifier GC_SUPABASE_ANON) ' + (e.why || '');
  if (/email_not_confirmed|not confirmed/.test(why)) return 'e-mail du compte lecteur pas encore confirmé';
  if (/invalid_credentials|invalid_grant|invalid login/.test(why)) return 'e-mail ou mot de passe du compte lecteur refusé';
  if (e && e.status === 429) return 'trop de tentatives de connexion, nouvel essai plus tard';
  return 'connexion du compte lecteur refusée' + (e ? ` (${e.status}${e.why ? ' ' + e.why : ''})` : '');
}
async function auth(env, grant, body) {
  const res = await fetch(`${env.GC_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: env.GC_SUPABASE_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Ne garde que le code d'erreur de Supabase (jamais la requête ni la session).
    let why = '';
    try { const e = await res.json(); why = String(e.error_code || e.error || e.msg || e.message || '').slice(0, 80); } catch (_) {}
    lastAuthError = { status: res.status, why };
    return null;
  }
  const s = await res.json();
  if (!s || !s.access_token || !s.refresh_token) return null;
  return { ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (+s.expires_in || 3600) };
}
async function session(env, force) {
  let s = force ? null : await meta(env, 'bot:session');
  if (s && s.expires_at * 1000 - Date.now() > 5 * 60e3) return s;
  if (s && s.refresh_token) s = await auth(env, 'refresh_token', { refresh_token: s.refresh_token });
  else s = null;
  if (!s) s = await auth(env, 'password', { email: env.GC_BOT_EMAIL, password: env.GC_BOT_PASSWORD });
  if (s) await setMeta(env, 'bot:session', s);
  return s;
}
// Cookie comme @supabase/ssr : « base64- » + JSON de session, coupé en morceaux .0, .1…
export function sessionCookie(projectRef, s) {
  const name = `sb-${projectRef}-auth-token`;
  const value = 'base64-' + b64url(JSON.stringify(s));
  if (value.length <= COOKIE_CHUNK) return `${name}=${value}`;
  const parts = [];
  for (let i = 0, k = 0; i < value.length; i += COOKIE_CHUNK, k++) parts.push(`${name}.${k}=${value.slice(i, i + COOKIE_CHUNK)}`);
  return parts.join('; ');
}
async function gameGet(env, path, s, rsc) {
  const headers = { Accept: rsc ? '*/*' : 'application/json', Cookie: sessionCookie(ref(env), s), 'User-Agent': 'Mozilla/5.0 (GMC Player Info reader)' };
  if (rsc) headers.RSC = '1';
  return fetch(GAME + path, { headers, redirect: 'manual' });
}

// Pages du jeu (réponse RSC de Next.js) : même lecture que l'extension.
function scanJson(text, key, open, close) {
  let from = 0;
  for (;;) {
    const i = text.indexOf(key, from);
    if (i < 0) return [];
    const start = i + key.length - 1;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let k = start; k < text.length; k++) {
      const ch = text[k];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === open) depth++; else if (ch === close && --depth === 0) { end = k; break; }
    }
    if (end < 0) return [];
    try { const v = JSON.parse(text.slice(start, end + 1)); return [v, end]; } catch (_) { from = end + 1; }
  }
}
export function clubPlayers(text) {
  let from = 0;
  while (from < text.length) {
    const [arr, end] = scanJson(text.slice(from), '"players":[', '[', ']');
    if (end == null) return null;
    if (Array.isArray(arr) && arr.length && arr[0] && 'overall' in arr[0] && 'id' in arr[0]) return arr;
    from += end + 1;
  }
  return null;
}
export const initialPlayer = (text) => scanJson(text, '"initialPlayer":{', '{', '}')[0] || null;
const crestOf = (text, teamId) => {
  const crests = text.match(/https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^"\\\s]*crest[^"\\\s]*/gi) || [];
  const c = crests.find(u => u.includes(teamId)) || crests[0] || null;
  return c && c.length <= 300 ? c : undefined;
};

function light(p) {
  const o = {};
  for (const k of DB_KEEP) if (p[k] !== undefined) o[k] = p[k];
  if (Array.isArray(o.traits)) o.traits = o.traits.map(t => (typeof t === 'string' ? t : (t && (t.name || t.label)) || '')).filter(Boolean);
  if (o.attributes && typeof o.attributes === 'object') { const a = {}; for (const [k, v] of Object.entries(o.attributes)) if (typeof v === 'number') a[k] = v; o.attributes = a; }
  return o;
}
function pageParams(a, p) {
  const sl = /^s:([A-Z]{2,3}):(\d{1,3}):(\d{1,3})$/.exec(a);
  if (sl) return `availability=all&position=${sl[1]}&sort=overall&minOvr=${sl[2]}${+sl[3] !== 150 ? `&maxOvr=${sl[3]}` : ''}&page=${p}`;
  return `availability=${encodeURIComponent(a)}&sort=overall&page=${p}`;
}

/**
 * Un passage : quelques pages réservées, lues dans le jeu, envoyées comme une
 * extension. `call(path, body)` appelle le serveur de l'intérieur (même code
 * que pour les extensions, sans licence).
 */
export async function botStep(env, call) {
  if (!botConfigured(env)) return { off: true };
  const st = (await meta(env, 'bot:status')) || {};
  const now = Date.now();
  // Réglages changés (clé, adresse) : la pause d'échec de connexion est levée.
  const cfg = [env.GC_SUPABASE_URL, env.GC_SUPABASE_ANON, env.GC_BOT_EMAIL].map(x => String(x).length + ':' + String(x).slice(-6)).join('|');
  if (st.pausedUntil && now < st.pausedUntil && st.cfg === cfg) return { paused: st.error };
  const save = (patch) => setMeta(env, 'bot:status', { ...st, ...patch, cfg, t: Date.now() });
  lastAuthError = null;
  let s = await session(env);
  if (!s) { const error = loginError(lastAuthError); await save({ ok: false, error, pausedUntil: now + PAUSE.login }); return { error: 'login', detail: error }; }
  let limit = Math.max(1, Math.min(20, parseInt(env.READER_PAGES || '', 10) || PAGES_PER_RUN));
  let retried = false;
  // 1. D'abord les demandes du site : fiches de joueurs et effectifs (« Mon
  //    effectif », clubs des utilisateurs), avant toute page de la base.
  const asked = await call('/v1/assign', { limit: 2, players: true, requestsOnly: true });
  let served = 0;
  for (const id of (asked && asked.players) || []) {
    const r = await gameGet(env, '/gamev2/players/' + encodeURIComponent(id), s, true);
    const p = r.ok ? initialPlayer(await r.text()) : null;
    if (p && p.id === id && p.attributes) { await call('/v1/players', { players: [{ fetchedAt: Date.now(), player: p }] }); served++; }
    else if ([401, 403, 429].includes(r.status) || (r.status >= 300 && r.status < 400)) break;
  }
  for (const teamId of (asked && asked.assigned) || []) {
    const r = await gameGet(env, '/gamev2/club/' + encodeURIComponent(teamId), s, true);
    const text = r.ok ? await r.text() : '';
    const players = text ? clubPlayers(text) : null;
    if (players) { await call('/v1/clubs', { clubs: [{ teamId, fetchedAt: Date.now(), players, crest: crestOf(text, teamId) }] }); served++; }
    else if ([401, 403, 429].includes(r.status) || (r.status >= 300 && r.status < 400)) break;
  }
  limit = Math.max(0, limit - served);
  // 2. Puis la base complète (marché et prêts d'abord, côté serveur).
  const assign = limit ? await call('/v1/db/assign', { limit, full: true }) : null;
  const tasks = (assign && assign.tasks) || [];
  let done = 0;
  for (const t of tasks) {
    if (done) await new Promise(r => setTimeout(r, env.READER_GAP_MS != null ? +env.READER_GAP_MS : GAP_MS));
    let res = await gameGet(env, '/api/players/database?' + pageParams(t.a, t.p), s);
    if (res.status === 401 && !retried) { retried = true; s = await session(env, true); if (s) res = await gameGet(env, '/api/players/database?' + pageParams(t.a, t.p), s); }
    if (!res || res.status === 401) { await save({ ok: false, error: 'session refusée par le jeu', pausedUntil: Date.now() + PAUSE.auth }); return { error: 401, done }; }
    if (res.status === 429) { await save({ ok: false, error: 'le jeu demande de ralentir', pausedUntil: Date.now() + PAUSE.rate }); return { error: 429, done }; }
    if (res.status === 403) { await save({ ok: false, error: 'accès interdit (compte bloqué ?)', pausedUntil: Date.now() + PAUSE.forbidden }); return { error: 403, done }; }
    if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) { await save({ ok: false, error: `page refusée : HTTP ${res.status}` }); continue; }
    const j = await res.json();
    if (!j || !Array.isArray(j.players)) continue;
    const players = j.players.map(x => (x && typeof x === 'object' ? light(x) : x));
    const ack = await call('/v1/db/players', { protocol: 2, players, rawCount: j.players.length, collectedAt: Date.now(),
      a: t.a, p: t.p, taskId: t.taskId, total: Number.isInteger(j.total) ? j.total : undefined });
    if (ack && (ack.status === 'completed' || ack.status === 'split')) done++;
  }
  const day = new Date().toISOString().slice(0, 10);
  const pagesToday = (st.day === day ? st.pagesToday || 0 : 0) + done;
  const requestsToday = (st.day === day ? st.requestsToday || 0 : 0) + served;
  await save({ ok: true, error: '', pausedUntil: 0, day, pagesToday, requestsToday, lastPages: done, budget: assign && assign.budget || null });
  return { done, tasks: tasks.length, requests: served };
}

/** État pour les statistiques (jamais la session). */
export async function botPublicStatus(env) {
  if (!botConfigured(env)) return null;
  const st = (await meta(env, 'bot:status')) || {};
  return { t: st.t || null, ok: !!st.ok, error: st.error || '', pausedUntil: st.pausedUntil || 0, pagesToday: st.pagesToday || 0, requestsToday: st.requestsToday || 0 };
}
