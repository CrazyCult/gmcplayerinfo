// Serveur de l'index commun GMC Companion (Cloudflare Worker + D1).
// Chaque extension envoie les effectifs qu'elle a lus et récupère ceux des
// autres : un club n'est lu sur GameChase qu'une fois pour tout le monde.
// Accès réservé aux installations ayant une licence valide (même signature
// ECDSA que l'extension).

const PRIVACY_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GMC Companion : politique de confidentialité</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1b2430}h1{color:#e0661b}h2{margin-top:28px}</style></head><body>
<h1>GMC Companion : politique de confidentialité</h1>
<p>Dernière mise à jour : 6 octobre 2026.</p>
<p>GMC Companion est une extension Chrome non officielle destinée aux joueurs du jeu en ligne GameChase (gamechase.io). Elle n'est ni affiliée ni approuvée par GameChase.</p>
<h2>Données conservées sur ton appareil</h2>
<p>Réglages des modules, position des panneaux, historique de tes matchs, index des joueurs consultés, code d'activation et identifiant d'installation aléatoire sont enregistrés dans le stockage local de l'extension, sur ton navigateur. Ils ne quittent pas ton appareil, sauf ce qui est décrit ci-dessous.</p>
<h2>Données envoyées au serveur de l'extension</h2>
<p>Si le partage d'index est actif, l'extension envoie au serveur de l'extension (Cloudflare Workers) :</p>
<ul><li>les effectifs des clubs GameChase que tu consultes dans le jeu (noms des joueurs du jeu, âge, poste, notes, potentiel, valeur, attributs), afin de les partager entre les utilisateurs de l'extension ;</li>
<li>les pages de la base des joueurs du jeu (scouting) que l'extension lit : joueurs du jeu, notes, potentiel, valeur et prix demandés en vente ou en prêt ;</li>
<li>l'identifiant d'installation aléatoire et le code d'activation, uniquement pour vérifier que l'accès est autorisé.</li></ul>
<p>L'extension ne collecte pas ton adresse e-mail, ton mot de passe, tes cookies, tes jetons de connexion GameChase ni ton historique de navigation. Elle ne fonctionne que sur gamechase.io.</p>
<h2>Utilisation et partage</h2>
<p>Les données des joueurs fictifs du jeu (identité dans le jeu, club, âge, poste, notes, potentiel, attributs, valeur, prix demandés en vente ou en prêt et informations sportives) alimentent aussi le site public GameChase Player Info. Elles sont consultables sans installer l'extension. Aucune donnée de manager, d'utilisateur, de licence, d'installation ou de connexion n'est publiée sur le site. Les données ne sont ni vendues ni utilisées à des fins publicitaires ou pour évaluer une solvabilité.</p>
<h2>Conservation et suppression</h2>
<p>Désinstaller l'extension supprime toutes les données locales. Pour demander la suppression des données envoyées au serveur, contacte l'éditeur à l'adresse indiquée sur la fiche Chrome Web Store de l'extension.</p>
</body></html>`;

const MAX_CLUBS_PER_POST = 10, MAX_PLAYERS = 60, MAX_CLUB_BYTES = 250000, PAGE = 50;

// Read the same snapshots as Companion, including clubs collected before this
// API existed. A transferred player appears once, in its latest snapshot.
export const SITE_PLAYERS_SQL = `WITH snapshots AS (
  SELECT c.team_id, c.fetched_at, j.value AS data,
    json_extract(j.value, '$.id') AS id,
    json_extract(j.value, '$.name') AS name,
    json_extract(j.value, '$.position') AS position,
    json_extract(j.value, '$.overall') AS overall,
    ROW_NUMBER() OVER (PARTITION BY json_extract(j.value, '$.id')
      ORDER BY c.fetched_at DESC, c.team_id ASC) AS rank
  FROM clubs c, json_each(c.players) j
) , players AS (SELECT * FROM snapshots WHERE rank = 1)`;

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

// Catalogue du site : collectes complètes de Companion (sous-attributs) et,
// pour les joueurs jamais collectés en entier, la fiche légère de la base du
// jeu (6 stats, prix). Le prix demandé courant est joint dans les deux cas.
export const SITE_CATALOG_SQL = `${SITE_PLAYERS_SQL}, merged AS (
  SELECT p.id, p.name, p.position, p.overall,
    json_extract(p.data, '$.age') AS age, json_extract(p.data, '$.potential') AS potential,
    p.fetched_at, p.team_id, 0 AS light, d.transfer_price, d.loan_fee, d.free_agent, d.club_name
  FROM players p LEFT JOIN db_players d ON d.id = p.id
  UNION ALL
  SELECT d.id, d.name, d.position, d.overall, d.age, d.potential, d.seen_at, COALESCE(d.club_id, ''), 1,
    d.transfer_price, d.loan_fee, d.free_agent, d.club_name
  FROM db_players d WHERE d.id NOT IN (SELECT id FROM players)
)`;
const SITE_SORTS = {
  overall: 'overall DESC',
  potential: 'potential DESC',
  gap: '(potential - overall) DESC',
  price: 'transfer_price IS NULL, transfer_price ASC',
  loan: 'loan_fee IS NULL, loan_fee ASC',
  age: 'age ASC',
};
const marketOf = (d) => d ? {
  transferPrice: d.transfer_price ?? null, loanFee: d.loan_fee ?? null, freeAgent: !!d.free_agent,
  clubName: d.club_name ?? null, seenAt: d.seen_at ?? null,
} : null;
// Fiche légère publiée depuis db_players : mêmes noms de champs que les collectes.
export function dbPublicPlayer(d) {
  let attrs = {}, traits = [];
  try { attrs = JSON.parse(d.attrs || '{}'); } catch (_) {}
  try { traits = JSON.parse(d.traits || '[]'); } catch (_) {}
  const player = {
    id: d.id, name: d.name, position: d.position, age: d.age, overall: d.overall, potential: d.potential,
    attributes: Object.fromEntries(Object.entries(attrs).filter(([k, v]) => PUBLIC_ATTRIBUTES.has(k) && typeof v === 'number' && Number.isFinite(v))),
    traits: traits.filter(t => typeof t === 'string'),
  };
  for (const [k, v] of [['nationality', d.nationality], ['flag_code', d.flag_code], ['value', d.value], ['portrait_url', d.portrait_url]])
    if (v != null) player[k] = v;
  if (d.club_id && !d.free_agent) player.club_id = d.club_id;
  return player;
}

async function siteRequest(req, env, url, json) {
  if (!env.SITE_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.SITE_TOKEN}`)
    return json({ error: 'Accès site non autorisé' }, 401);
  if (req.method !== 'GET') return json({ error: 'Lecture seule' }, 405);
  if (env.SITE_RATE_LIMITER) {
    const { success } = await env.SITE_RATE_LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || 'site' });
    if (!success) return json({ error: 'Trop de requêtes' }, 429);
  }
  await ensureDb(env);
  const prefix = '/v1/site/player/';
  if (url.pathname.startsWith(prefix)) {
    let id;
    try { id = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return json({ error: 'Identifiant invalide' }, 400); }
    if (!isStr(id, 128)) return json({ error: 'Identifiant invalide' }, 400);
    const row = await env.DB.prepare(`${SITE_PLAYERS_SQL} SELECT * FROM players WHERE id = ?1`).bind(id).first();
    const d = await env.DB.prepare('SELECT * FROM db_players WHERE id = ?1').bind(id).first();
    if (!row && !d) return json({ error: 'Joueur introuvable' }, 404);
    const player = row ? publicPlayer(row) : dbPublicPlayer(d);
    const prices = d ? (await env.DB.prepare(`SELECT kind, price, overall, potential, age, first_seen, last_seen FROM db_prices
      WHERE player_id = ?1 ORDER BY first_seen DESC LIMIT 50`).bind(id).all()).results : [];
    // Prix demandés de joueurs comparables (même poste, âge et OVR ±2, 30 derniers jours).
    const comparables = (await env.DB.prepare(`SELECT kind, price, overall, potential, age, last_seen FROM db_prices
      WHERE position = ?1 AND age BETWEEN ?2 - 2 AND ?2 + 2 AND overall BETWEEN ?3 - 2 AND ?3 + 2 AND last_seen > ?4 AND player_id != ?5
      ORDER BY last_seen DESC LIMIT 300`).bind(player.position, player.age, player.overall, Date.now() - 30 * 864e5, id).all()).results;
    return json({
      player, fetchedAt: row ? row.fetched_at : d.seen_at, teamId: row ? row.team_id : (d.club_id || ''),
      light: !row, market: marketOf(d), prices, comparables,
    });
  }
  if (!['/v1/site/players', '/v1/site/search'].includes(url.pathname)) return json({ error: 'Introuvable' }, 404);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (url.pathname.endsWith('/search') && query.length < 3) return json({ players: [], total: 0, page: 1, pages: 0 });
  const position = (url.searchParams.get('position') || '').slice(0, 3);
  const avail = ['transfer', 'loan', 'free', 'full'].includes(url.searchParams.get('avail')) ? url.searchParams.get('avail') : '';
  const order = SITE_SORTS[url.searchParams.get('sort')] || SITE_SORTS.overall;
  const page = Math.min(1000000, Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const limit = url.pathname.endsWith('/search') ? 10 : 50;
  // instr treats %, _ and quotes as literal text; all user values are bound.
  const where = ` WHERE (?1 = '' OR instr(lower(name), lower(?1)) > 0 OR id = ?1) AND (?2 = '' OR position = ?2)
    AND (?3 = '' OR (?3 = 'transfer' AND transfer_price > 0) OR (?3 = 'loan' AND loan_fee > 0) OR (?3 = 'free' AND free_agent = 1) OR (?3 = 'full' AND light = 0))`;
  const count = await env.DB.prepare(`${SITE_CATALOG_SQL} SELECT COUNT(*) AS total FROM merged${where}`).bind(query, position, avail).first();
  const { results } = await env.DB.prepare(`${SITE_CATALOG_SQL} SELECT * FROM merged${where} ORDER BY ${order}, id ASC LIMIT ?4 OFFSET ?5`)
    .bind(query, position, avail, limit, (page - 1) * limit).all();
  return json({ players: results.map(row => ({
    player: { id: row.id, name: row.name, position: row.position, age: row.age, overall: row.overall, potential: row.potential },
    fetchedAt: row.fetched_at, teamId: row.team_id || '', light: !!row.light,
    market: { transferPrice: row.transfer_price ?? null, loanFee: row.loan_fee ?? null, freeAgent: !!row.free_agent, clubName: row.club_name ?? null },
  })), total: count.total, page, pages: Math.ceil(count.total / limit) });
}

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
let leasesReady = false;
let dbReady = false;

// --- Base des joueurs du jeu (/api/players/database) -------------------------
// Pages de 24 joueurs lues par les extensions (passivement ou confiées par
// /v1/db/assign), version légère : 6 stats résumées, OVR, POT, prix.
const DB_PAGE_SIZE = 24, DB_AVAIL = ['all', 'transfer', 'loan', 'free'];
const DB_MARKET_MS = 55 * 60e3;      // marché et prêts : relus chaque heure
const DB_FULL_MS = 24 * 3600e3;      // base complète : un tour par jour au plus
const DB_LEASE_MS = 10 * 60e3;
const DB_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS db_players (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, position TEXT,
    age INTEGER, overall INTEGER, potential INTEGER, value INTEGER, club_id TEXT, club_name TEXT, nationality TEXT, flag_code TEXT,
    free_agent INTEGER, transfer_price INTEGER, loan_fee INTEGER, traits TEXT, attrs TEXT, portrait_url TEXT, seen_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS db_players_name ON db_players(name_norm)',
  'CREATE INDEX IF NOT EXISTS db_players_ovr ON db_players(overall)',
  'CREATE INDEX IF NOT EXISTS db_players_pos ON db_players(position, overall)',
  `CREATE TABLE IF NOT EXISTS db_prices (player_id TEXT NOT NULL, kind TEXT NOT NULL, price INTEGER NOT NULL,
    overall INTEGER, potential INTEGER, age INTEGER, position TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    PRIMARY KEY (player_id, kind, price))`,
  'CREATE INDEX IF NOT EXISTS db_prices_seen ON db_prices(last_seen)',
  `CREATE TABLE IF NOT EXISTS db_pages (a TEXT NOT NULL, p INTEGER NOT NULL, done_at INTEGER NOT NULL DEFAULT 0,
    leased_until INTEGER NOT NULL DEFAULT 0, leased_by TEXT, PRIMARY KEY (a, p))`,
  'CREATE TABLE IF NOT EXISTS db_meta (k TEXT PRIMARY KEY, v TEXT)',
];
async function ensureDb(env) {
  if (dbReady) return;
  await env.DB.batch(DB_SCHEMA.map(q => env.DB.prepare(q)));
  // Première page de chaque liste suivie : le reste est créé quand le total est connu.
  await env.DB.batch(['all', 'transfer', 'loan'].map(a => env.DB.prepare('INSERT OR IGNORE INTO db_pages (a, p) VALUES (?1, 1)').bind(a)));
  dbReady = true;
}
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
function validDbPlayer(p) {
  if (!p || !isStr(p.id, 64) || !isStr(p.name, 80) || !isInt(p.overall, 1, 200) || !isInt(p.potential, 1, 200) || !isInt(p.age, 10, 60) || !isStr(p.position, 4)) return false;
  if (p.attributes != null && (typeof p.attributes !== 'object' || Object.keys(p.attributes).length > 12 || !Object.values(p.attributes).every(v => v == null || isNum(v, 0, 250)))) return false;
  for (const k of ['value', 'transfer_price', 'loan_fee']) if (p[k] != null && !isNum(p[k], 0, 1e12)) return false;
  return true;
}

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

const isStr = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validPlayer(p) {
  return p && isStr(p.id, 64) && isStr(p.name, 80) && isInt(p.overall, 1, 150) && isInt(p.potential, 1, 150) &&
    isInt(p.age, 10, 60) && (p.value == null || (typeof p.value === 'number' && p.value >= 0));
}

export default {
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
    if (url.pathname.startsWith('/v1/site/')) return siteRequest(req, env, url, json);
    if (req.method === 'GET' && url.pathname === '/privacy') {
      return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const installId = req.headers.get('X-GMC-Install');
    if (!(await licenceOk(env, installId, req.headers.get('X-GMC-Licence')))) return json({ error: 'licence invalide ou expirée' }, 401);

    // Envoi d'effectifs : on ne garde que la version la plus récente de chaque club.
    if (req.method === 'POST' && url.pathname === '/v1/clubs') {
      let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
      const clubs = Array.isArray(body.clubs) ? body.clubs.slice(0, MAX_CLUBS_PER_POST) : [];
      const now = Date.now(); let accepted = 0, rejected = 0;
      const stmts = [];
      for (const c of clubs) {
        const players = Array.isArray(c.players) ? c.players : null;
        const text = players ? JSON.stringify(players) : '';
        if (!isStr(c.teamId, 64) || !isInt(c.fetchedAt, 1.6e12, now + 5 * 60e3) || !players || !players.length ||
            players.length > MAX_PLAYERS || !players.every(validPlayer) || text.length > MAX_CLUB_BYTES) { rejected++; continue; }
        stmts.push(env.DB.prepare(
          `INSERT INTO clubs (team_id, fetched_at, updated_at, contributor, players) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(team_id) DO UPDATE SET fetched_at = excluded.fetched_at, updated_at = excluded.updated_at,
             contributor = excluded.contributor, players = excluded.players
           WHERE excluded.fetched_at > clubs.fetched_at`).bind(c.teamId, c.fetchedAt, now, installId || null, text));
        accepted++;
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json({ accepted, rejected });
    }

    // Récupération : tout ce qui a changé depuis le curseur « since ».
    if (req.method === 'GET' && url.pathname === '/v1/clubs') {
      const since = parseInt(url.searchParams.get('since') || '0', 10) || 0;
      const { results } = await env.DB.prepare('SELECT team_id, fetched_at, updated_at, players FROM clubs WHERE updated_at > ?1 ORDER BY updated_at ASC LIMIT ?2')
        .bind(since, PAGE).all();
      return json({
        clubs: results.map(r => ({ teamId: r.team_id, fetchedAt: r.fetched_at, players: JSON.parse(r.players) })),
        next: results.length ? results[results.length - 1].updated_at : since,
        more: results.length === PAGE,
      });
    }

    // Répartition du rafraîchissement : chaque extension envoie sa liste de
    // clubs prioritaires (les plus anciens, managers actifs d'abord) ; le
    // serveur lui en confie au plus 20 qui ne sont ni réservés par une autre
    // extension (bail de 2 h) ni rafraîchis depuis moins de 24 h.
    if (req.method === 'POST' && url.pathname === '/v1/assign') {
      if (!leasesReady) {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS leases (team_id TEXT PRIMARY KEY, leased_until INTEGER NOT NULL, leased_by TEXT)').run();
        leasesReady = true;
      }
      let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
      const limit = Math.max(0, Math.min(20, parseInt(body.limit, 10) || 0));
      // Fenêtre de fraîcheur demandée par le client (1 h à 72 h), défaut 12 h :
      // un club relu dans cette fenêtre n'est pas réattribué.
      const freshH = Math.max(1, Math.min(72, parseInt(body.minFreshHours, 10) || 12));
      const cands = (Array.isArray(body.candidates) ? body.candidates : []).filter(x => isStr(x, 64)).slice(0, 300);
      if (!limit || !cands.length) return json({ assigned: [] });
      const now = Date.now();
      const busy = new Set(), fresh = new Set();
      for (let i = 0; i < cands.length; i += 90) {
        const part = cands.slice(i, i + 90), ph = part.map((_, k) => '?' + (k + 2)).join(',');
        const l = await env.DB.prepare(`SELECT team_id FROM leases WHERE leased_until > ?1 AND team_id IN (${ph})`).bind(now, ...part).all();
        l.results.forEach(r => busy.add(r.team_id));
        const c = await env.DB.prepare(`SELECT team_id FROM clubs WHERE fetched_at > ?1 AND team_id IN (${ph})`).bind(now - freshH * 3600e3, ...part).all();
        c.results.forEach(r => fresh.add(r.team_id));
      }
      const assigned = cands.filter(id => !busy.has(id) && !fresh.has(id)).slice(0, limit);
      if (assigned.length) {
        await env.DB.batch(assigned.map(id => env.DB.prepare(
          'INSERT INTO leases (team_id, leased_until, leased_by) VALUES (?1, ?2, ?3) ON CONFLICT(team_id) DO UPDATE SET leased_until = excluded.leased_until, leased_by = excluded.leased_by'
        ).bind(id, now + 30 * 60e3, installId || null)));
      }
      return json({ assigned });
    }

    // Liste légère (identifiant + date) pour que chaque extension sache ce
    // qui manque au serveur et le rattrape.
    if (req.method === 'GET' && url.pathname === '/v1/index') {
      const { results } = await env.DB.prepare('SELECT team_id, fetched_at FROM clubs').all();
      return json({ count: results.length, clubs: results.map(r => [r.team_id, r.fetched_at]) });
    }

    // --- Base des joueurs ---------------------------------------------------
    if (url.pathname.startsWith('/v1/db/')) {
      await ensureDb(env);
      const now = Date.now();

      // Envoi d'une page lue dans le jeu.
      if (req.method === 'POST' && url.pathname === '/v1/db/players') {
        let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
        const a = DB_AVAIL.includes(body.a) ? body.a : null;
        const p = isInt(body.p, 1, 100000) ? body.p : null;
        const raw = Array.isArray(body.players) ? body.players.slice(0, 60) : [];
        const players = raw.filter(validDbPlayer);
        if (!players.length && !(a && p)) return json({ error: 'données refusées' }, 400);
        const stmts = [];
        for (const x of players) {
          const tp = x.transfer_price ?? null, lf = x.loan_fee ?? null;
          stmts.push(env.DB.prepare(
            `INSERT INTO db_players (id, name, name_norm, position, age, overall, potential, value, club_id, club_name, nationality, flag_code,
               free_agent, transfer_price, loan_fee, traits, attrs, portrait_url, seen_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_norm=excluded.name_norm, position=excluded.position, age=excluded.age,
               overall=excluded.overall, potential=excluded.potential, value=excluded.value, club_id=excluded.club_id, club_name=excluded.club_name,
               nationality=excluded.nationality, flag_code=excluded.flag_code, free_agent=excluded.free_agent, transfer_price=excluded.transfer_price,
               loan_fee=excluded.loan_fee, traits=excluded.traits, attrs=excluded.attrs, portrait_url=excluded.portrait_url, seen_at=excluded.seen_at`
          ).bind(x.id, x.name, normName(x.name), x.position, x.age, x.overall, x.potential, x.value ?? null,
            isStr(x.club_id, 64) ? x.club_id : null, isStr(x.club_name, 80) ? x.club_name : null,
            isStr(x.nationality, 60) ? x.nationality : null, isStr(x.flag_code, 4) ? x.flag_code : null,
            x.free_agent ? 1 : 0, tp, lf, JSON.stringify(Array.isArray(x.traits) ? x.traits.filter(t => isStr(t, 40)).slice(0, 8) : []),
            JSON.stringify(x.attributes || {}), isStr(x.portrait_url, 300) ? x.portrait_url : null, now));
          for (const [kind, price] of [['transfer', tp], ['loan', lf]]) {
            if (price == null || price <= 0) continue;
            stmts.push(env.DB.prepare(
              `INSERT INTO db_prices (player_id, kind, price, overall, potential, age, position, first_seen, last_seen)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(player_id, kind, price) DO UPDATE SET last_seen = excluded.last_seen`
            ).bind(x.id, kind, Math.round(price), x.overall, x.potential, x.age, x.position, now));
          }
        }
        if (a && p) {
          stmts.push(env.DB.prepare('INSERT INTO db_pages (a, p, done_at) VALUES (?1, ?2, ?3) ON CONFLICT(a, p) DO UPDATE SET done_at = excluded.done_at, leased_until = 0').bind(a, p, now));
          // Total connu : on crée (ou on retire) les pages de cette liste.
          if (isInt(body.total, 0, 2000000) && a !== 'free') {
            const pages = Math.ceil(body.total / DB_PAGE_SIZE);
            stmts.push(env.DB.prepare(`WITH RECURSIVE s(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM s WHERE x < ?2)
              INSERT OR IGNORE INTO db_pages (a, p) SELECT ?1, x FROM s`).bind(a, Math.max(1, pages)));
            stmts.push(env.DB.prepare('DELETE FROM db_pages WHERE a = ?1 AND p > ?2').bind(a, Math.max(1, pages)));
            stmts.push(env.DB.prepare('INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('total:' + a, String(body.total)));
          }
        }
        await env.DB.batch(stmts);
        return json({ accepted: players.length, rejected: raw.length - players.length });
      }

      // Pages confiées : marché et prêts d'abord (toutes les heures), puis la
      // base complète, les pages les plus anciennes en premier (un tour par jour).
      if (req.method === 'POST' && url.pathname === '/v1/db/assign') {
        let body; try { body = await req.json(); } catch (_) { body = {}; }
        const limit = Math.max(1, Math.min(30, parseInt(body.limit, 10) || 10));
        const market = await env.DB.prepare(`SELECT a, p FROM db_pages WHERE a IN ('transfer', 'loan') AND done_at < ?1 AND leased_until < ?2
          ORDER BY done_at ASC, p ASC LIMIT ?3`).bind(now - DB_MARKET_MS, now, limit).all();
        let tasks = market.results.map(r => ({ a: r.a, p: r.p, kind: 'market' }));
        if (tasks.length < limit && body.full !== false) {
          const full = await env.DB.prepare(`SELECT a, p FROM db_pages WHERE a = 'all' AND done_at < ?1 AND leased_until < ?2
            ORDER BY done_at ASC, p ASC LIMIT ?3`).bind(now - DB_FULL_MS, now, limit - tasks.length).all();
          tasks = tasks.concat(full.results.map(r => ({ a: r.a, p: r.p, kind: 'full' })));
        }
        if (tasks.length) await env.DB.batch(tasks.map(t => env.DB.prepare('UPDATE db_pages SET leased_until = ?3, leased_by = ?4 WHERE a = ?1 AND p = ?2')
          .bind(t.a, t.p, now + DB_LEASE_MS, installId || null)));
        return json({ tasks });
      }

      // Recherche dans la base (50 par page).
      if (req.method === 'GET' && url.pathname === '/v1/db/search') {
        const q = url.searchParams, where = [], args = [];
        const add = (sql, v) => { args.push(v); where.push(sql.replace('?', '?' + args.length)); };
        const num = (k) => { const v = parseInt(q.get(k) || '', 10); return Number.isFinite(v) ? v : null; };
        if (q.get('q') && q.get('q').length >= 2) { const v = '%' + normName(q.get('q')).slice(0, 40) + '%'; args.push(v); where.push(`(name_norm LIKE ?${args.length} OR lower(club_name) LIKE ?${args.length} OR lower(nationality) LIKE ?${args.length})`); }
        const pos = (q.get('pos') || '').toUpperCase(); if (/^[A-Z]{2,3}$/.test(pos)) add('position = ?', pos);
        if (num('ageMin') != null) add('age >= ?', num('ageMin')); if (num('ageMax') != null) add('age <= ?', num('ageMax'));
        if (num('ovrMin') != null) add('overall >= ?', num('ovrMin')); if (num('ovrMax') != null) add('overall <= ?', num('ovrMax'));
        if (num('potMin') != null) add('potential >= ?', num('potMin')); if (num('potMax') != null) add('potential <= ?', num('potMax'));
        if (num('gapMin') != null) add('potential - overall >= ?', num('gapMin'));
        if (num('priceMax') != null) add('transfer_price <= ?', num('priceMax'));
        const av = q.get('avail');
        if (av === 'transfer') where.push('transfer_price IS NOT NULL AND transfer_price > 0');
        else if (av === 'loan') where.push('loan_fee IS NOT NULL AND loan_fee > 0');
        else if (av === 'free') where.push('free_agent = 1');
        const SORT = { overall: 'overall', potential: 'potential', gap: '(potential - overall)', age: 'age', value: 'value', price: 'transfer_price', loan: 'loan_fee', seen: 'seen_at', name: 'name_norm' };
        const sort = SORT[q.get('sort')] || 'overall', dir = q.get('dir') === 'asc' ? 'ASC' : 'DESC';
        const page = Math.max(0, Math.min(2000, num('page') || 0));
        const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM db_players ${W}`).bind(...args).first()).n;
        const { results } = await env.DB.prepare(`SELECT id, name, position, age, overall, potential, value, club_id, club_name, nationality, flag_code,
            free_agent, transfer_price, loan_fee, traits, attrs, portrait_url, seen_at FROM db_players ${W}
            ORDER BY ${sort} IS NULL, ${sort} ${dir}, id LIMIT 50 OFFSET ${page * 50}`).bind(...args).all();
        return json({ total, page, players: results.map(r => ({ ...r, free_agent: !!r.free_agent, traits: JSON.parse(r.traits || '[]'), attrs: JSON.parse(r.attrs || '{}') })) });
      }

      // Historique des prix demandés d'un joueur.
      if (req.method === 'GET' && url.pathname === '/v1/db/prices') {
        const id = url.searchParams.get('id');
        if (!isStr(id, 64)) return json({ error: 'id manquant' }, 400);
        const { results } = await env.DB.prepare('SELECT kind, price, overall, potential, age, first_seen, last_seen FROM db_prices WHERE player_id = ?1 ORDER BY first_seen').bind(id).all();
        return json({ prices: results });
      }

      if (req.method === 'GET' && url.pathname === '/v1/db/stats') {
        const c = await env.DB.prepare(`SELECT COUNT(*) AS players, SUM(transfer_price > 0) AS transfer, SUM(loan_fee > 0) AS loan, SUM(free_agent) AS free,
          MAX(seen_at) AS last FROM db_players`).first();
        const pg = await env.DB.prepare(`SELECT a, COUNT(*) AS pages, SUM(done_at > ?1) AS fresh, MAX(done_at) AS last FROM db_pages GROUP BY a`).bind(now - DB_FULL_MS).all();
        const meta = await env.DB.prepare("SELECT k, v FROM db_meta WHERE k LIKE 'total:%'").all();
        return json({ ...c, pages: pg.results, totals: Object.fromEntries(meta.results.map(r => [r.k.slice(6), +r.v])) });
      }
      return json({ error: 'introuvable' }, 404);
    }

    if (req.method === 'GET' && url.pathname === '/v1/stats') {
      const r = await env.DB.prepare('SELECT COUNT(*) AS clubs, MAX(updated_at) AS last FROM clubs').first();
      return json(r);
    }
    return json({ error: 'introuvable' }, 404);
  },
};
