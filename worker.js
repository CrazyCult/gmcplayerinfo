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
<li>l'identifiant d'installation aléatoire et le code d'activation, uniquement pour vérifier que l'accès est autorisé.</li></ul>
<p>L'extension ne collecte pas ton adresse e-mail, ton mot de passe, tes cookies, tes jetons de connexion GameChase ni ton historique de navigation. Elle ne fonctionne que sur gamechase.io.</p>
<h2>Utilisation et partage</h2>
<p>Les données des joueurs fictifs du jeu (identité dans le jeu, club, âge, poste, notes, potentiel, attributs, valeur et informations sportives) alimentent aussi le site public GameChase Player Info. Elles sont consultables sans installer l'extension. Aucune donnée de manager, d'utilisateur, de licence, d'installation ou de connexion n'est publiée sur le site. Les données ne sont ni vendues ni utilisées à des fins publicitaires ou pour évaluer une solvabilité.</p>
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

async function siteRequest(req, env, url, json) {
  if (!env.SITE_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.SITE_TOKEN}`)
    return json({ error: 'Accès site non autorisé' }, 401);
  if (req.method !== 'GET') return json({ error: 'Lecture seule' }, 405);
  if (env.SITE_RATE_LIMITER) {
    const { success } = await env.SITE_RATE_LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || 'site' });
    if (!success) return json({ error: 'Trop de requêtes' }, 429);
  }
  const prefix = '/v1/site/player/';
  if (url.pathname.startsWith(prefix)) {
    let id;
    try { id = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return json({ error: 'Identifiant invalide' }, 400); }
    if (!isStr(id, 128)) return json({ error: 'Identifiant invalide' }, 400);
    const row = await env.DB.prepare(`${SITE_PLAYERS_SQL} SELECT * FROM players WHERE id = ?1`).bind(id).first();
    return row ? json({ player: publicPlayer(row), fetchedAt: row.fetched_at, teamId: row.team_id }) : json({ error: 'Joueur introuvable' }, 404);
  }
  if (!['/v1/site/players', '/v1/site/search'].includes(url.pathname)) return json({ error: 'Introuvable' }, 404);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (url.pathname.endsWith('/search') && query.length < 3) return json({ players: [], total: 0, page: 1, pages: 0 });
  const position = (url.searchParams.get('position') || '').slice(0, 3);
  const page = Math.min(1000000, Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const limit = url.pathname.endsWith('/search') ? 10 : 50;
  // instr treats %, _ and quotes as literal text; all user values are bound.
  const where = " WHERE (?1 = '' OR instr(lower(name), lower(?1)) > 0 OR id = ?1) AND (?2 = '' OR position = ?2)";
  const count = await env.DB.prepare(`${SITE_PLAYERS_SQL} SELECT COUNT(*) AS total FROM players${where}`).bind(query, position).first();
  const { results } = await env.DB.prepare(`${SITE_PLAYERS_SQL} SELECT * FROM players${where} ORDER BY overall DESC, id ASC LIMIT ?3 OFFSET ?4`).bind(query, position, limit, (page - 1) * limit).all();
  return json({ players: results.map(row => {
    const raw = publicPlayer(row);
    const player = Object.fromEntries(['id', 'name', 'position', 'age', 'overall', 'potential'].map(key => [key, raw[key]]));
    return { player, fetchedAt: row.fetched_at, teamId: row.team_id };
  }), total: count.total, page, pages: Math.ceil(count.total / limit) });
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

    if (req.method === 'GET' && url.pathname === '/v1/stats') {
      const r = await env.DB.prepare('SELECT COUNT(*) AS clubs, MAX(updated_at) AS last FROM clubs').first();
      return json(r);
    }
    return json({ error: 'introuvable' }, 404);
  },
};
