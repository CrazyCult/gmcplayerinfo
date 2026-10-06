// Serveur GMC Companion + API du site (Cloudflare Worker + Supabase).

const PRIVACY_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GMC Companion : politique de confidentialité</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1b2430}h1{color:#e0661b}h2{margin-top:28px}</style></head><body>
<h1>GMC Companion : politique de confidentialité</h1>
<p>Dernière mise à jour : 6 octobre 2026.</p>
<p>GMC Companion est une extension Chrome non officielle destinée aux joueurs du jeu en ligne GameChase (gamechase.io). Elle n'est ni affiliée ni approuvée par GameChase.</p>
<h2>Données conservées sur ton appareil</h2>
<p>Réglages des modules, position des panneaux, historique de tes matchs, index des joueurs consultés, code d'activation et identifiant d'installation aléatoire sont enregistrés dans le stockage local de l'extension, sur ton navigateur. Ils ne quittent pas ton appareil, sauf ce qui est décrit ci-dessous.</p>
<h2>Données envoyées au serveur de l'extension</h2>
<p>Si le partage d'index est actif, l'extension envoie au serveur de l'extension (Cloudflare Workers, base de données hébergée par Supabase) :</p>
<ul><li>les effectifs des clubs GameChase que tu consultes dans le jeu (noms des joueurs du jeu, âge, poste, notes, potentiel, valeur, attributs), afin de les partager entre les utilisateurs de l'extension ;</li>
<li>les pages de la base des joueurs du jeu (scouting) que l'extension lit : joueurs du jeu, notes, potentiel, valeur et prix demandés en vente ou en prêt ;</li>
<li>l'identifiant d'installation aléatoire et le code d'activation, uniquement pour vérifier que l'accès est autorisé.</li></ul>
<p>L'extension ne collecte pas ton adresse e-mail, ton mot de passe, tes cookies, tes jetons de connexion GameChase ni ton historique de navigation. Elle ne fonctionne que sur gamechase.io.</p>
<h2>Utilisation et partage</h2>
<p>Les données des joueurs fictifs du jeu (identité dans le jeu, club, âge, poste, notes, potentiel, attributs, valeur, prix demandés en vente ou en prêt et informations sportives) alimentent aussi le site public GameChase Player Info. Elles sont consultables sans installer l'extension. Aucune donnée de manager, d'utilisateur, de licence, d'installation ou de connexion n'est publiée sur le site. Les données ne sont ni vendues ni utilisées à des fins publicitaires ou pour évaluer une solvabilité.</p>
<h2>Conservation et suppression</h2>
<p>Désinstaller l'extension supprime toutes les données locales. Pour demander la suppression des données envoyées au serveur, contacte l'éditeur à l'adresse indiquée sur la fiche Chrome Web Store de l'extension.</p>
</body></html>`;

// Serveur de l'index commun GMC Companion et de l'API du site GameChase Player
// Info. Cloudflare Worker ; les données sont dans PostgreSQL (Supabase), via
// les fonctions gmc_* de supabase/schema.sql appelées avec la clé secrète.
// Aucun quota de lignes : seule la taille de la base (500 Mo en gratuit) compte.

const MAX_CLUBS_PER_POST = 10, MAX_PLAYERS = 60, MAX_CLUB_BYTES = 250000, PAGE = 50;
const DB_AVAIL = ['all', 'transfer', 'loan', 'free'];
const CATALOG_MAX_PAGE = 1000;

// --- Accès Supabase ------------------------------------------------------------
// rpcText : corps déjà sérialisé et réponse brute (aucun JSON.parse des gros
// effectifs dans le Worker : le temps de calcul du plan gratuit est de 10 ms).
export async function rpcText(env, fn, body) {
  const key = env.SUPABASE_SECRET_KEY || '';
  if (!env.SUPABASE_URL || !key) throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SECRET_KEY)');
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // ancienne clé service_role (JWT)
  const res = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`Supabase ${fn} : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.text();
}
export async function rpc(env, fn, args = {}) {
  const text = await rpcText(env, fn, JSON.stringify(args));
  return text ? JSON.parse(text) : null;
}

const isStr = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const asJson = (v, fallback) => { if (v == null) return fallback; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (_) { return fallback; } };

const PUBLIC_PLAYER_FIELDS = [
  'id', 'name', 'position', 'age', 'overall', 'potential', 'nationality',
  'flag_code', 'flagCode', 'rarity', 'career_phase', 'careerPhase', 'traits',
  'playing_style', 'playingStyle', 'preferred_foot', 'preferredFoot',
  'value', 'wage', 'salary', 'contract_end', 'contractEnd',
  'contract_demand_gmc2', 'contractDemand', 'fitness', 'morale', 'form',
  'matches_played', 'matchesPlayed', 'goals', 'assists', 'clean_sheets',
  'cleanSheets', 'injured', 'onLoan', 'is_youth_product', 'youthProduct',
  'portrait_url', 'portraitUrl', 'card_url', 'cardUrl',
];
const PUBLIC_ATTRIBUTES = new Set(('pac sho pas dri def phy div han kic ref pos spe ' +
  'acceleration sprintSpeed attackingPositioning finishing shotPower longShots volleys penalties ' +
  'vision crossing fkAccuracy shortPassing longPassing curve agility balance reactions ' +
  'ballControl dribblingSub composure firstTouch interceptions headingAccuracy defensiveAwareness standingTackle ' +
  'slidingTackle jumping stamina strength aggression gkDiving gkHandling gkKicking gkReflexes gkPositioningSub gkSprintSpeed gkAcceleration').split(' '));

export function publicPlayer(row) {
  const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  const safeValue = value => ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value)) || (Array.isArray(value) && value.every(item => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item))));
  const player = Object.fromEntries(PUBLIC_PLAYER_FIELDS.filter(key => safeValue(raw[key])).map(key => [key, raw[key]]));
  const filterAttributes = attrs => Object.fromEntries(Object.entries(attrs || {}).filter(([key, value]) => PUBLIC_ATTRIBUTES.has(key) && typeof value === 'number' && Number.isFinite(value)));
  player.attributes = filterAttributes(raw.attributes);
  if (raw.attributes?.subs) player.attributes.subs = filterAttributes(raw.attributes.subs);
  player.club_id = row.team_id;
  return player;
}

// Fiche légère publiée depuis db_players : mêmes noms de champs que les collectes.
export function dbPublicPlayer(d) {
  const attrs = asJson(d.attrs, {}), traits = asJson(d.traits, []);
  const player = {
    id: d.id, name: d.name, position: d.position, age: d.age, overall: d.overall, potential: d.potential,
    attributes: Object.fromEntries(Object.entries(attrs || {}).filter(([k, v]) => PUBLIC_ATTRIBUTES.has(k) && typeof v === 'number' && Number.isFinite(v))),
    traits: (Array.isArray(traits) ? traits : []).filter(t => typeof t === 'string'),
  };
  for (const [k, v] of [['nationality', d.nationality], ['flag_code', d.flag_code], ['value', d.value], ['portrait_url', d.portrait_url]])
    if (v != null) player[k] = v;
  if (d.club_id && !d.free_agent) player.club_id = d.club_id;
  return player;
}
const marketOf = (s) => s ? {
  transferPrice: s.transfer_price ?? null, loanFee: s.loan_fee ?? null, freeAgent: !!s.free_agent, clubName: s.club_name ?? null,
} : null;
const CATALOG_KEYS = ['q', 'position', 'ageMin', 'ageMax', 'ovrMin', 'ovrMax', 'potMin', 'potMax', 'gapMin', 'priceMax', 'avail', 'sort', 'page'];
function catalogParams(searchParams) {
  const p = {};
  for (const k of CATALOG_KEYS) {
    const v = searchParams.get(k);
    if (v == null || v === '') continue;
    if (['q', 'avail', 'sort'].includes(k)) p[k] = v.slice(0, 60);
    else if (k === 'position') { if (/^[A-Z]{2,3}$/.test(v)) p[k] = v; }
    else { const n = parseInt(v, 10); if (Number.isFinite(n)) p[k] = String(k === 'page' ? Math.min(CATALOG_MAX_PAGE, Math.max(1, n)) : n); }
  }
  return p;
}

async function siteRequest(req, env, url, json) {
  if (!env.SITE_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.SITE_TOKEN}`)
    return json({ error: 'Accès site non autorisé' }, 401);
  const requestPrefix = '/v1/site/request/', statusPrefix = '/v1/site/status/', playerPrefix = '/v1/site/player/';
  const isRequest = url.pathname.startsWith(requestPrefix);
  if (req.method !== (isRequest ? 'POST' : 'GET')) return json({ error: isRequest ? 'POST attendu' : 'Lecture seule' }, 405);
  if (env.SITE_RATE_LIMITER) {
    try {
      const { success } = await env.SITE_RATE_LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || 'site' });
      if (!success) return json({ error: 'Trop de requêtes' }, 429);
    } catch (_) { /* limiteur indisponible : on continue */ }
  }
  const idFrom = (prefix) => { try { const id = decodeURIComponent(url.pathname.slice(prefix.length)); return isStr(id, 128) ? id : null; } catch { return null; } };
  const now = Date.now();

  if (isRequest || url.pathname.startsWith(statusPrefix)) {
    const id = idFrom(isRequest ? requestPrefix : statusPrefix);
    if (!id) return json({ error: 'Identifiant invalide' }, 400);
    const r = await rpc(env, 'gmc_site_request', { p_id: id, p_write: isRequest, p_now: now });
    if (r.error === 'introuvable') return json({ error: 'Joueur introuvable' }, 404);
    if (r.error === 'agent-libre') return json({ error: 'Agent libre : aucun effectif à lire.' }, 409);
    if (r.error === 'file-pleine') return json({ error: 'Trop de demandes en attente, réessaie plus tard.' }, 429);
    return json(r);
  }

  if (url.pathname.startsWith(playerPrefix)) {
    const id = idFrom(playerPrefix);
    if (!id) return json({ error: 'Identifiant invalide' }, 400);
    const r = await rpc(env, 'gmc_player', { p_id: id, p_now: now });
    if (!r) return json({ error: 'Joueur introuvable' }, 404);
    const s = r.site, light = !r.raw;
    const player = light ? dbPublicPlayer(r.db) : publicPlayer({ data: r.raw, team_id: s.team_id });
    return json({ player, fetchedAt: r.fetchedAt, teamId: (s && s.team_id) || player.club_id || '', light,
      market: marketOf(s || r.db), prices: r.prices || [], comparables: r.comparables || [] });
  }

  if (!['/v1/site/players', '/v1/site/search'].includes(url.pathname)) return json({ error: 'Introuvable' }, 404);
  const search = url.pathname.endsWith('/search');
  const params = catalogParams(url.searchParams);
  if (search && (params.q || '').trim().length < 3) return json({ players: [], total: 0, page: 1, pages: 0 });
  const c = await rpc(env, 'gmc_catalog', { p: params, p_limit: search ? 10 : 50, p_details: false });
  return json({ players: c.rows.map(row => ({
    player: { id: row.id, name: row.name, position: row.position, age: row.age, overall: row.overall, potential: row.potential },
    fetchedAt: row.src_at || 0, teamId: row.team_id || '', light: !!row.light, market: marketOf(row),
  })), total: c.total, capped: false, page: c.page, pages: c.pages });
}

// --- Licence -------------------------------------------------------------------
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(); const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
function addWeeks(wk, n) {
  const [y, w] = wk.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)); const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1 + n) * 7);
  return weekKey(mon);
}
const b64uDec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64uDecStr = (s) => new TextDecoder().decode(b64uDec(s));
let keyCache = null;
async function licenceOk(env, installId, code) {
  if (!env.PUBLIC_KEY_JWK) return true;
  if (!installId || !code) return false;
  try {
    keyCache = keyCache || await crypto.subtle.importKey('jwk', JSON.parse(env.PUBLIC_KEY_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const c = JSON.parse(b64uDecStr(String(code).replace(/^GMC-/, '')));
    if (c.u && c.t > addWeeks(c.f, 3)) return false; // code d'examen : 4 semaines maximum
    const who = c.u ? '*' : installId;
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keyCache, b64uDec(c.s), new TextEncoder().encode(`GMC1|${who}|${c.f}|${c.t}`));
    const now = weekKey();
    return ok && now >= c.f && now <= c.t;
  } catch (_) { return false; }
}
function validPlayer(p) {
  return p && isStr(p.id, 64) && isStr(p.name, 80) && isInt(p.overall, 1, 150) && isInt(p.potential, 1, 150) &&
    isInt(p.age, 10, 60) && (p.value == null || (typeof p.value === 'number' && p.value >= 0));
}
function validDbPlayer(p) {
  if (!p || !isStr(p.id, 64) || !isStr(p.name, 80) || !isInt(p.overall, 1, 200) || !isInt(p.potential, 1, 200) || !isInt(p.age, 10, 60) || !isStr(p.position, 4)) return false;
  if (p.attributes != null && (typeof p.attributes !== 'object' || Object.keys(p.attributes).length > 12 || !Object.values(p.attributes).every(v => v == null || isNum(v, 0, 250)))) return false;
  for (const k of ['value', 'transfer_price', 'loan_fee']) if (p[k] != null && !isNum(p[k], 0, 1e12)) return false;
  return true;
}
// Seuls les champs attendus d'une ligne de la base du jeu sont transmis.
function cleanDbPlayer(x) {
  return {
    id: x.id, name: x.name, position: x.position, age: x.age, overall: x.overall, potential: x.potential,
    value: x.value ?? null, club_id: isStr(x.club_id, 64) ? x.club_id : null, club_name: isStr(x.club_name, 80) ? x.club_name : null,
    nationality: isStr(x.nationality, 60) ? x.nationality : null, flag_code: isStr(x.flag_code, 4) ? x.flag_code : null,
    free_agent: !!x.free_agent, transfer_price: x.transfer_price ?? null, loan_fee: x.loan_fee ?? null,
    traits: Array.isArray(x.traits) ? x.traits.filter(t => isStr(t, 40)).slice(0, 8) : [],
    attributes: x.attributes && typeof x.attributes === 'object' ? x.attributes : {},
    portrait_url: isStr(x.portrait_url, 300) ? x.portrait_url : null,
  };
}

// --- Migration automatique depuis l'ancienne base D1 ------------------------------
// Tant que le binding DB (D1) existe, la tâche planifiée recopie les clubs puis
// la base du jeu vers Supabase, par petits lots, jusqu'à la fin.
export async function migrateStep(env) {
  if (!env.DB) return { skipped: 'pas de D1' };
  if ((await rpc(env, 'gmc_meta_get', { p_k: 'mig:done' })) === '1') return { done: true };
  const cursor = (await rpc(env, 'gmc_meta_get', { p_k: 'mig:club' })) || '';
  const PER_RUN = 40;
  if (cursor !== '~') {
    const { results } = await env.DB.prepare('SELECT team_id, fetched_at, updated_at, players FROM clubs WHERE team_id > ?1 ORDER BY team_id LIMIT ?2')
      .bind(cursor, PER_RUN).all();
    // Le texte des effectifs est recopié tel quel (pas de JSON.parse : 10 ms de calcul en gratuit).
    for (let i = 0; i < results.length; i += 10) {
      const part = results.slice(i, i + 10).filter(c => typeof c.players === 'string' && c.players.startsWith('['));
      if (!part.length) continue;
      const clubs = part.map(c => `{"teamId":${JSON.stringify(c.team_id)},"fetchedAt":${Number(c.fetched_at) || 0},"players":${c.players}}`).join(',');
      await rpcText(env, 'gmc_post_clubs', `{"p_clubs":[${clubs}],"p_contributor":"migration","p_now":${Number(part[0].updated_at) || Date.now()}}`);
    }
    await rpc(env, 'gmc_meta_set', { p_k: 'mig:club', p_v: results.length < PER_RUN ? '~' : results[results.length - 1].team_id });
    return { clubs: results.length };
  }
  const dcur = (await rpc(env, 'gmc_meta_get', { p_k: 'mig:db' })) || '';
  let results = [];
  try {
    results = (await env.DB.prepare('SELECT * FROM db_players WHERE id > ?1 ORDER BY id LIMIT 500').bind(dcur).all()).results;
  } catch (_) { results = []; } // table absente : rien à migrer
  if (results.length) {
    const players = results.map(d => cleanDbPlayer({ ...d, attributes: asJson(d.attrs, {}), traits: asJson(d.traits, []) }));
    await rpc(env, 'gmc_db_players', { p_a: null, p_p: null, p_total: null, p_players: players, p_now: Date.now() });
  }
  await rpc(env, 'gmc_meta_set', results.length < 500 ? { p_k: 'mig:done', p_v: '1' } : { p_k: 'mig:db', p_v: results[results.length - 1].id });
  return { db: results.length };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(migrateStep(env).catch(() => {}));
  },
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-GMC-Install, X-GMC-Licence',
      'Access-Control-Max-Age': '86400',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/privacy') {
      return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    try {
      if (url.pathname.startsWith('/v1/site/')) return await siteRequest(req, env, url, json);
      return await extensionRequest(req, env, url, json);
    } catch (e) {
      return json({ error: 'Erreur serveur', detail: String(e && e.message || e).slice(0, 300) }, 500);
    }
  },
};

async function extensionRequest(req, env, url, json) {
  const installId = req.headers.get('X-GMC-Install');
  if (!(await licenceOk(env, installId, req.headers.get('X-GMC-Licence')))) return json({ error: 'licence invalide ou expirée' }, 401);
  const now = Date.now();
  const body = async () => { try { return await req.json(); } catch (_) { return null; } };

  if (req.method === 'POST' && url.pathname === '/v1/clubs') {
    const b = await body(); if (!b) return json({ error: 'JSON invalide' }, 400);
    const clubs = Array.isArray(b.clubs) ? b.clubs.slice(0, MAX_CLUBS_PER_POST) : [];
    const valid = [];
    let rejected = 0;
    for (const c of clubs) {
      const players = Array.isArray(c.players) ? c.players : null;
      if (!isStr(c.teamId, 64) || !isInt(c.fetchedAt, 1.6e12, now + 5 * 60e3) || !players || !players.length ||
          players.length > MAX_PLAYERS || !players.every(validPlayer) || JSON.stringify(players).length > MAX_CLUB_BYTES) { rejected++; continue; }
      valid.push({ teamId: c.teamId, fetchedAt: c.fetchedAt, players });
    }
    if (valid.length) await rpc(env, 'gmc_post_clubs', { p_clubs: valid, p_contributor: installId || null, p_now: now });
    return json({ accepted: valid.length, rejected });
  }

  // Réponses volumineuses transmises telles quelles ({ clubs, next, more }).
  const raw = (text) => new Response(text, { headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Content-Type': 'application/json' } });
  if (req.method === 'GET' && url.pathname === '/v1/clubs') {
    const since = parseInt(url.searchParams.get('since') || '0', 10) || 0;
    return raw(await rpcText(env, 'gmc_clubs_since', JSON.stringify({ p_since: since, p_limit: PAGE })));
  }

  if (req.method === 'POST' && url.pathname === '/v1/assign') {
    const b = await body(); if (!b) return json({ error: 'JSON invalide' }, 400);
    const limit = Math.max(0, Math.min(20, parseInt(b.limit, 10) || 0));
    const freshH = Math.max(1, Math.min(72, parseInt(b.minFreshHours, 10) || 12));
    const cands = (Array.isArray(b.candidates) ? b.candidates : []).filter(x => isStr(x, 64)).slice(0, 300);
    if (!limit) return json({ assigned: [] });
    const assigned = await rpc(env, 'gmc_assign', { p_limit: limit, p_fresh_h: freshH, p_cands: cands, p_by: installId || null, p_now: now });
    return json({ assigned });
  }

  if (req.method === 'GET' && url.pathname === '/v1/index') return raw(await rpcText(env, 'gmc_index', '{}'));

  if (req.method === 'POST' && url.pathname === '/v1/db/players') {
    const b = await body(); if (!b) return json({ error: 'JSON invalide' }, 400);
    const a = DB_AVAIL.includes(b.a) ? b.a : null;
    const p = isInt(b.p, 1, 100000) ? b.p : null;
    const raw = Array.isArray(b.players) ? b.players.slice(0, 60) : [];
    const players = raw.filter(validDbPlayer).map(cleanDbPlayer);
    if (!players.length && !(a && p)) return json({ error: 'données refusées' }, 400);
    await rpc(env, 'gmc_db_players', { p_a: a && p ? a : null, p_p: a && p ? p : null,
      p_total: a && p && isInt(b.total, 0, 2000000) ? b.total : null, p_players: players, p_now: now });
    return json({ accepted: players.length, rejected: raw.length - players.length });
  }

  if (req.method === 'POST' && url.pathname === '/v1/db/assign') {
    const b = (await body()) || {};
    const limit = Math.max(1, Math.min(30, parseInt(b.limit, 10) || 10));
    const tasks = await rpc(env, 'gmc_db_assign', { p_limit: limit, p_full: b.full !== false, p_by: installId || null, p_now: now });
    return json({ tasks });
  }

  if (req.method === 'GET' && url.pathname === '/v1/db/search') {
    const params = catalogParams(url.searchParams);
    params.page = String((parseInt(url.searchParams.get('page') || '0', 10) || 0) + 1); // l'extension compte depuis 0
    const c = await rpc(env, 'gmc_catalog', { p: params, p_limit: 50, p_details: true });
    return json({ total: c.total, capped: false, page: c.page - 1, players: c.rows.map(r => ({
      id: r.id, name: r.name, position: r.position, age: r.age, overall: r.overall, potential: r.potential, value: r.value ?? null,
      club_id: r.team_id || r.club_id || null, club_name: r.club_name, nationality: r.nationality ?? null, flag_code: r.flag_code ?? null,
      free_agent: !!r.free_agent, transfer_price: r.transfer_price, loan_fee: r.loan_fee, traits: asJson(r.traits, []), attrs: asJson(r.attrs, {}),
      portrait_url: r.portrait_url ?? null, seen_at: r.seen_at || r.src_at || 0, light: !!r.light,
    })) });
  }

  if (req.method === 'GET' && url.pathname === '/v1/db/prices') {
    const id = url.searchParams.get('id');
    if (!isStr(id, 64)) return json({ error: 'id manquant' }, 400);
    return json({ prices: await rpc(env, 'gmc_db_prices', { p_id: id }) });
  }

  if (req.method === 'GET' && url.pathname === '/v1/db/stats') return json(await rpc(env, 'gmc_db_stats', { p_now: now }));
  if (req.method === 'GET' && url.pathname === '/v1/stats') return json(await rpc(env, 'gmc_stats'));
  return json({ error: 'introuvable' }, 404);
}
