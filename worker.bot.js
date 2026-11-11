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
  const res = await fetch(GAME + path, { headers, redirect: 'manual' });
  // Pages : le jeu envoie certains comptes de /gamev2/… vers /gamev3/… ; on
  // suit cette seule redirection (jamais vers la connexion ni un autre site).
  if (rsc && res.status >= 300 && res.status < 400) {
    let to = null;
    try { to = new URL(res.headers.get('location') || '', GAME); } catch (_) {}
    if (to && to.origin === GAME && /^\/gamev[23]\/(club|players)\//.test(to.pathname) && to.pathname !== path)
      return fetch(GAME + to.pathname + to.search, { headers, redirect: 'manual' });
  }
  return res;
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
export function clubPlayers(text, teamId) {
  let from = 0;
  while (from < text.length) {
    const [arr, end] = scanJson(text.slice(from), '"players":[', '[', ']');
    if (end == null) break;
    if (Array.isArray(arr) && arr.length && arr[0] && 'overall' in arr[0] && 'id' in arr[0]) return arr;
    from += end + 1;
  }
  // Seulement les joueurs du club (la page peut citer d'autres joueurs).
  const v3 = rscPlayers(text).players.filter(p => !teamId || p.club_id == null || p.club_id === teamId);
  return v3.length ? v3 : null;
}

// Pages /gamev3 : les joueurs ne sont plus dans une liste "players" ; on lit
// chaque ligne JSON de la réponse RSC et on garde les objets qui ressemblent à
// un joueur (identifiant, nom, stats pac…), quel que soit leur emplacement.
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '$undefined') return o[k]; return undefined; };
const int = (v) => (typeof v === 'number' ? Math.round(v) : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Math.round(+v) : undefined);
function v3Player(o, attrs) {
  const overall = int(pick(o, ['overall', 'ovr', 'rating', 'overall_rating', 'overallRating', 'current_overall', 'currentOverall']));
  const potential = int(pick(o, ['potential', 'pot', 'potential_rating', 'potentialRating', 'max_potential']));
  const age = int(pick(o, ['age']));
  const name = pick(o, ['name', 'full_name', 'fullName', 'display_name', 'displayName']);
  if (typeof o.id !== 'string' || typeof name !== 'string' || overall == null || potential == null || age == null) return null;
  return { ...o, name, overall, potential, age, attributes: o.attributes && typeof o.attributes === 'object' ? o.attributes : attrs,
    position: pick(o, ['position', 'pos', 'main_position', 'mainPosition']), club_id: pick(o, ['club_id', 'clubId', 'team_id', 'teamId']) };
}
export function rscPlayers(text) {
  const found = new Map();
  let shape = null;
  const visit = (node, parent, depth) => {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (!Array.isArray(node) && typeof node.pac === 'number') {
      // Stats seules (attributs) : le joueur est l'objet parent ; sinon l'objet lui-même.
      const owner = typeof node.id === 'string' ? node : parent;
      if (owner && typeof owner.id === 'string' && !found.has(owner.id)) {
        const p = v3Player(owner, owner === node ? undefined : node);
        if (p) found.set(owner.id, p);
        else if (!shape) shape = { joueur: Object.keys(owner).slice(0, 40), stats: owner === node ? null : Object.keys(node).slice(0, 20) };
      }
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) if (v && typeof v === 'object') visit(v, Array.isArray(node) ? parent : node, depth + 1);
  };
  for (const line of text.split('\n')) {
    const m = /^[0-9a-f]+:(.*)$/s.exec(line);
    const body = m ? m[1] : line;
    if (!/^[[{]/.test(body) || !body.includes('"pac"')) continue;
    try { visit(JSON.parse(body), null, 0); } catch (_) {}
  }
  return { players: [...found.values()], shape };
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
async function begin(env) {
  if (!botConfigured(env)) return { result: { off: true } };
  const st = (await meta(env, 'bot:status')) || {};
  const now = Date.now();
  // Réglages changés (clé, adresse) : la pause d'échec de connexion est levée.
  const cfg = [env.GC_SUPABASE_URL, env.GC_SUPABASE_ANON, env.GC_BOT_EMAIL].map(x => String(x).length + ':' + String(x).slice(-6)).join('|');
  if (st.pausedUntil && now < st.pausedUntil && st.cfg === cfg) return { result: { paused: st.error } };
  const save = (patch) => setMeta(env, 'bot:status', { ...st, ...patch, cfg, t: Date.now() });
  lastAuthError = null;
  let s = await session(env);
  if (!s) { const error = loginError(lastAuthError); await save({ ok: false, error, pausedUntil: now + PAUSE.login }); return { result: { error: 'login', detail: error } }; }
  return { st, save, s };
}
// Demandes du site (fiches de joueurs, effectifs entiers) : servies avant tout.
// Pourquoi une page n'a rien donné (pour les journaux et /v1/db/stats).
function whyFailed(r, text, what) {
  if (r.status >= 300 && r.status < 400) {
    let to = r.headers.get('location') || '';
    try { to = new URL(to, GAME).pathname; } catch (_) {}
    return `redirigé vers ${to || '?'} (HTTP ${r.status})`;
  }
  if (!r.ok) return `HTTP ${r.status}`;
  const n = (k) => text.split(k).length - 1;
  const sh = rscPlayers(text).shape;
  if (sh) return `${what} : forme inconnue dans ${new URL(r.url || GAME).pathname} — joueur {${sh.joueur.join(',')}}` + (sh.stats ? ` stats {${sh.stats.join(',')}}` : '');
  // Extrait autour du premier « pac » : de quoi voir comment la page range les joueurs.
  const i = text.indexOf('"pac"');
  const around = i < 0 ? '' : ' extrait : ' + JSON.stringify(text.slice(Math.max(0, i - 700), i + 250));
  return `${what} introuvable dans la page ${new URL(r.url || GAME).pathname} (${(r.headers.get('content-type') || '?').split(';')[0]}, ${text.length} octets, ` +
    `"players":[ ×${n('"players":[')}, "overall" ×${n('"overall"')}, "pac" ×${n('"pac"')}, "initialPlayer" ×${n('"initialPlayer"')})` + around;
}
// Fiche complète par l'API du jeu (/api/players/{id}) : même réponse en v2 et
// en v3, 51 sous-attributs, ~3 Ko. Repli si les pages ne donnent rien.
const API_PER_RUN = 12;               // fiches lues par passage (limite d'appels Cloudflare)
async function apiPlayer(env, id, s) {
  const r = await gameGet(env, '/api/players/' + encodeURIComponent(id), s);
  if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return { r, p: null };
  let j = null; try { j = await r.json(); } catch (_) {}
  const p = j && typeof j === 'object' ? (j.player && typeof j.player === 'object' ? j.player : j) : null;
  return { r, p: p && p.id === id && typeof p.overall === 'number' && p.attributes && typeof p.attributes === 'object' ? p : null };
}
const stop = (r) => [401, 403, 429].includes(r.status) || (r.status >= 300 && r.status < 400);
const pause = (env) => new Promise(res => setTimeout(res, env.READER_GAP_MS != null ? Math.min(+env.READER_GAP_MS, 250) : 250));

// Effectif par l'API, joueur par joueur (en plusieurs passages si besoin) : la
// liste des joueurs du club vient de la base ; l'instantané part à la fin.
async function clubViaApi(env, call, s, teamId) {
  const key = 'bot:club:' + teamId;
  const st = (await meta(env, key)) || { ids: null, got: {}, since: Date.now() };
  if (!st.ids) st.ids = ((await env.DB.prepare('SELECT id FROM site_players WHERE team_id = ?1 LIMIT 120').bind(teamId).all()).results || []).map(x => x.id);
  if (!st.ids.length) { await env.DB.prepare('DELETE FROM db_meta WHERE k = ?1').bind(key).run(); return { error: 'aucun joueur connu pour ce club' }; }
  const todo = st.ids.filter(id => !st.got[id]);
  let read = 0, last = null;
  for (const id of todo.slice(0, API_PER_RUN)) {
    if (read) await pause(env);
    const { r, p } = await apiPlayer(env, id, s);
    last = r; read++;
    if (p) st.got[id] = p;
    else if (stop(r)) break;
    else st.got[id] = false;    // joueur parti, fiche refusée : on n'insiste pas
  }
  const left = st.ids.filter(id => st.got[id] === undefined).length;
  if (left && !(last && stop(last))) { await setMeta(env, key, st); return { partial: st.ids.length - left, total: st.ids.length }; }
  if (left) { await setMeta(env, key, st); return { error: `API ${last.status}`, stopped: last }; }
  const players = Object.values(st.got).filter(Boolean);
  await env.DB.prepare('DELETE FROM db_meta WHERE k = ?1').bind(key).run();
  if (!players.length) return { error: 'aucune fiche lue par l\'API' };
  const refused = await sendClub(call, teamId, players);
  return refused ? { error: refused } : { done: players.length };
}

// Effectif envoyé au serveur : au-delà de 430 Ko, on retire les champs lourds
// sans intérêt pour le site (longs textes, listes d'objets) ; puis on vérifie
// que le serveur l'a bien accepté.
const CLUB_MAX = 430000;
function slim(players) {
  if (JSON.stringify(players).length <= CLUB_MAX) return players;
  return players.map(p => Object.fromEntries(Object.entries(p).filter(([k, v]) => k === 'attributes' || k === 'traits' ||
    !((typeof v === 'string' && v.length > 200) || (Array.isArray(v) && v.some(x => x && typeof x === 'object')) || (v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length > 400)))));
}
async function sendClub(call, teamId, players, crest) {
  const list = slim(players).slice(0, 100);
  const size = JSON.stringify(list).length;
  const ack = await call('/v1/clubs', { clubs: [{ teamId, fetchedAt: Date.now(), players: list, ...(crest ? { crest } : {}) }] });
  if (ack && ack.accepted === 1) return null;
  return `effectif refusé par le serveur (${list.length} joueurs, ${size} octets${ack && ack.error ? ', ' + ack.error : ''})`;
}

async function serveRequests(env, call, s) {
  const asked = await call('/v1/assign', { limit: 2, players: true, requestsOnly: true });
  let served = 0;
  const failed = [], progress = [];
  for (const id of (asked && asked.players) || []) {
    // 1. L'API (légère, indépendante de la version du jeu), 2. la page.
    const a = await apiPlayer(env, id, s);
    let p = a.p, why = '';
    if (!p && !stop(a.r)) {
      const r = await gameGet(env, '/gamev2/players/' + encodeURIComponent(id), s, true);
      const text = r.ok ? await r.text() : '';
      p = text ? initialPlayer(text) : null;
      if (!(p && p.id === id && p.attributes)) { p = null; why = `API ${a.r.status}, page : ${whyFailed(r, text, 'fiche')}`; if (stop(r)) { failed.push(`joueur ${id} : ${why}`); return { served, failed, progress }; } }
    } else if (!p) why = `API ${a.r.status}`;
    if (p) { await call('/v1/players', { players: [{ fetchedAt: Date.now(), player: p }] }); served++; continue; }
    failed.push(`joueur ${id} : ${why}`);
    // Identifiant inconnu du jeu : la demande est retirée (pas de relecture en boucle).
    if (a.r.status === 404) await call('/v1/players', { players: [], missing: [id] });
    if (stop(a.r)) return { served, failed, progress };
  }
  for (const teamId of (asked && asked.assigned) || []) {
    // Lecture par l'API déjà commencée : on la continue.
    let viaApi = !!(await meta(env, 'bot:club:' + teamId));
    if (!viaApi) {
      const r = await gameGet(env, '/gamev2/club/' + encodeURIComponent(teamId), s, true);
      const text = r.ok ? await r.text() : '';
      const players = text ? clubPlayers(text, teamId) : null;
      if (players) {
        const refused = await sendClub(call, teamId, players, crestOf(text, teamId));
        if (refused) failed.push(`club ${teamId} : ${refused}`); else served++;
        continue;
      }
      if ([401, 429].includes(r.status)) { failed.push(`club ${teamId} : ${whyFailed(r, text, 'effectif')}`); return { served, failed, progress }; }
      viaApi = true;   // page v3 (cartes sans données) ou page absente : l'API joueur par joueur
    }
    const res = await clubViaApi(env, call, s, teamId);
    if (res.done) served++;
    else if (res.partial) progress.push(`club ${teamId} : ${res.partial}/${res.total} fiches lues par l'API`);
    else { failed.push(`club ${teamId} : ${res.error}`); if (res.stopped) return { served, failed, progress }; }
  }
  return { served, failed, progress };
}
const today = () => new Date().toISOString().slice(0, 10);
/**
 * Demande faite sur le site : servie tout de suite (appelé juste après la
 * demande), sans attendre le passage de la minute.
 */
export async function botRequests(env, call) {
  const b = await begin(env);
  if (b.result) return b.result;
  const { served, failed, progress } = await serveRequests(env, call, b.s);
  if (served || failed.length) {
    const st = (await meta(env, 'bot:status')) || b.st, day = today();
    await setMeta(env, 'bot:status', { ...st, day, pagesToday: st.day === day ? st.pagesToday || 0 : 0,
      requestsToday: (st.day === day ? st.requestsToday || 0 : 0) + served,
      requestError: failed.length ? failed.join(' ; ').slice(0, 1500) : '', t: Date.now() });
  }
  return { requests: served, ...(progress.length ? { progress } : {}), ...(failed.length ? { failed } : {}) };
}
// --- Alerte intégrée du jeu -------------------------------------------------
// Le jeu surveille le marché avec la recherche armée sur le compte lecteur et
// range ses trouvailles dans /api/notifications (transfer_search_match). On
// relit cette liste (lecture seule) et on envoie chaque nouveau joueur sur
// Discord, avec son lien. Rien n'est marqué comme lu ni réarmé.
const ALERT_FRESH_MS = 15 * 60e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const alertTarget = (env) => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(env.ALERT_DISCORD_WEBHOOK || '') ? 'webhook'
  : env.ALERT_DISCORD_BOT_TOKEN && /^\d{15,22}$/.test(env.ALERT_DISCORD_USER_ID || '') ? 'dm' : null;
const fmtGmc = (n) => (Number.isFinite(+n) ? Math.round(+n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') : '?');
async function discordPost(env, payload) {
  const body = JSON.stringify(payload);
  if (alertTarget(env) === 'webhook') {
    const r = await fetch(env.ALERT_DISCORD_WEBHOOK.replace('discordapp.com', 'discord.com'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return r.ok ? '' : `Discord : HTTP ${r.status}`;
  }
  const auth = { Authorization: 'Bot ' + env.ALERT_DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' };
  let channel = (await meta(env, 'bot:alertDm'))?.id;
  if (!channel) {
    const r = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: auth, body: JSON.stringify({ recipient_id: env.ALERT_DISCORD_USER_ID }) });
    const j = r.ok ? await r.json() : null;
    if (!j || !j.id) return `Discord : message privé impossible (HTTP ${r.status})`;
    channel = j.id; await setMeta(env, 'bot:alertDm', { id: channel });
  }
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers: auth, body });
  if (r.status === 404) await setMeta(env, 'bot:alertDm', {});
  return r.ok ? '' : `Discord : HTTP ${r.status}`;
}
async function gameAlerts(env, s) {
  if (!alertTarget(env)) return null;
  const r = await gameGet(env, '/api/notifications', s);
  if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return { error: `notifications : HTTP ${r.status}` };
  const j = await r.json();
  const list = (Array.isArray(j) ? j : j.notifications || []).filter(n => n && n.activity_type === 'transfer_search_match' && Number.isFinite(+n.id));
  const st = (await meta(env, 'bot:alerts')) || {};
  const now = Date.now();
  const fresh = list.filter(n => +n.id > (+st.lastId || 0) && (st.lastId || now - Date.parse(n.created_at || 0) < ALERT_FRESH_MS)).sort((a, b) => +a.id - +b.id).slice(0, 10);
  const lastId = list.reduce((mx, n) => Math.max(mx, +n.id), +st.lastId || 0);
  if (!fresh.length) { if (lastId !== st.lastId) await setMeta(env, 'bot:alerts', { ...st, lastId }); return { sent: 0 }; }
  // Fiche du joueur : l'annonce du marché (lisible sans session), sinon la base.
  let listings = [];
  try { const m = await fetch(GAME + '/api/transfers/listings?sort=overall&order=desc&status=active&view=market', { headers: { Accept: 'application/json' } }); if (m.ok) { const d = await m.json(); listings = Array.isArray(d) ? d : d.listings || d.data || []; } } catch (_) {}
  const embeds = [];
  for (const n of fresh) {
    const md = n.metadata || {}, id = UUID.test(md.playerId || '') ? md.playerId : null;
    const l = listings.find(x => x && ((md.listingId && String(x.id) === String(md.listingId)) || (id && x.player && x.player.id === id))) || null;
    let p = l && l.player;
    if (!p && id) p = await env.DB.prepare('SELECT name, position, age, overall, potential, value, club_name FROM db_players WHERE id = ?1').bind(id).first();
    const fields = p ? [
      { name: 'Poste', value: String(p.position || '?'), inline: true },
      { name: 'Âge', value: `${p.age} ans`, inline: true },
      { name: 'OVR / POT', value: `${p.overall} / ${p.potential}`, inline: true },
      ...(l && l.price_gmc2 != null ? [{ name: 'Prix', value: `**${fmtGmc(l.price_gmc2)}** GMC2`, inline: true }] : []),
      ...(p.value != null ? [{ name: 'Valeur', value: `${fmtGmc(p.value)} GMC2`, inline: true }] : []),
      ...(l && l.seller_club_name || p.club_name ? [{ name: 'Club', value: String(l && l.seller_club_name || p.club_name).slice(0, 200), inline: true }] : []),
    ] : [];
    embeds.push({
      title: ('🆕 ' + (p && p.name ? p.name : 'Un joueur correspond à ta recherche')).slice(0, 250),
      url: GAME + (id ? '/gamev2/transfers?playerId=' + id : '/gamev2/transfers'),
      description: 'Alerte du jeu (recherche armée sur le compte lecteur)',
      color: 0xff9142, fields,
      footer: { text: 'GMC Player Info · Alerte du jeu' },
      timestamp: n.created_at || new Date().toISOString(),
    });
  }
  const error = await discordPost(env, { content: `**${embeds.length} joueur${embeds.length > 1 ? 's' : ''}** signalé${embeds.length > 1 ? 's' : ''} par l’alerte du jeu`, embeds });
  // En cas d'échec Discord, on ne retient pas ces alertes : elles repartiront au prochain passage.
  if (!error) await setMeta(env, 'bot:alerts', { lastId: Math.max(...fresh.map(n => +n.id), +st.lastId || 0), t: now });
  return error ? { error } : { sent: embeds.length };
}

export async function botStep(env, call) {
  const b = await begin(env);
  if (b.result) return b.result;
  const { st, save } = b;
  let s = b.s;
  let limit = Math.max(1, Math.min(20, parseInt(env.READER_PAGES || '', 10) || PAGES_PER_RUN));
  let retried = false;
  // 1. D'abord les demandes du site : fiches de joueurs et effectifs (« Mon
  //    effectif », clubs des utilisateurs), avant toute page de la base.
  const { served, failed, progress } = await serveRequests(env, call, s);
  limit = Math.max(0, limit - served);
  // 1 bis. L'alerte du jeu, relayée vers Discord (si une cible Discord est réglée).
  let alerts = null;
  try { alerts = await gameAlerts(env, s); } catch (e) { alerts = { error: 'alerte du jeu : ' + (e && e.message || e) }; }
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
  const day = today();
  const pagesToday = (st.day === day ? st.pagesToday || 0 : 0) + done;
  const requestsToday = (st.day === day ? st.requestsToday || 0 : 0) + served;
  const alertsToday = (st.day === day ? st.alertsToday || 0 : 0) + (alerts && alerts.sent || 0);
  await save({ ok: true, error: '', pausedUntil: 0, day, pagesToday, requestsToday, alertsToday, lastPages: done, budget: assign && assign.budget || null,
    ...(alerts ? { alertError: alerts.error || '', alertT: Date.now() } : {}),
    ...(served || failed.length ? { requestError: failed.join(' ; ').slice(0, 1500) } : {}) });
  return { done, tasks: tasks.length, requests: served, ...(alerts ? { alerts: alerts.error || alerts.sent } : {}), ...(progress.length ? { progress } : {}), ...(failed.length ? { failed } : {}) };
}

/** État pour les statistiques (jamais la session). */
export async function botPublicStatus(env) {
  if (!botConfigured(env)) return null;
  const st = (await meta(env, 'bot:status')) || {};
  return { t: st.t || null, ok: !!st.ok, error: st.error || '', pausedUntil: st.pausedUntil || 0, pagesToday: st.pagesToday || 0, requestsToday: st.requestsToday || 0, requestError: st.requestError || '',
    alerts: alertTarget(env) ? { t: st.alertT || null, sentToday: st.alertsToday || 0, error: st.alertError || '' } : null };
}
