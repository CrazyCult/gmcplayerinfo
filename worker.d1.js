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
<p>Si le partage d'index est actif, l'extension envoie au serveur de l'extension (Cloudflare Workers ; base de données hébergée par Turso) :</p>
<ul><li>les effectifs des clubs GameChase que tu consultes dans le jeu (noms des joueurs du jeu, âge, poste, notes, potentiel, valeur, attributs), afin de les partager entre les utilisateurs de l'extension ;</li>
<li>les pages de la base des joueurs du jeu (scouting) que l'extension lit : joueurs du jeu, notes, potentiel, valeur et prix demandés en vente ou en prêt ;</li>
<li>l'identifiant d'installation aléatoire et le code d'activation, uniquement pour vérifier que l'accès est autorisé.</li></ul>
<p>L'extension ne collecte pas ton adresse e-mail, ton mot de passe, tes cookies, tes jetons de connexion GameChase ni ton historique de navigation. Elle ne fonctionne que sur gamechase.io.</p>
<h2>Utilisation et partage</h2>
<p>Les données des joueurs fictifs du jeu (identité dans le jeu, club, âge, poste, notes, potentiel, attributs, valeur, prix demandés en vente ou en prêt et informations sportives) alimentent aussi le site public GameChase Player Info. Elles sont consultables sans installer l'extension. Aucune donnée de manager, d'utilisateur, de licence, d'installation ou de connexion n'est publiée sur le site. Les données ne sont ni vendues ni utilisées à des fins publicitaires ou pour évaluer une solvabilité.</p>
<h2>Conservation et suppression</h2>
<p>Désinstaller l'extension supprime toutes les données locales. Pour demander la suppression des données envoyées au serveur, contacte l'éditeur à l'adresse indiquée sur la fiche Chrome Web Store de l'extension.</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Économie de D1 (plan gratuit : 5 M lignes lues et 100 000 écrites par jour).
// - Le site ne parcourt jamais les effectifs : la table indexée site_players
//   (une ligne par joueur) répond à toutes les recherches, et une fiche ne lit
//   qu'une ligne de site_players puis la ligne du club concerné.
// - Toutes les écritures sont conditionnelles : rien n'est réécrit si rien n'a
//   changé (une relecture quotidienne de la base ne coûte presque rien).
// - Un budget d'écritures par jour suspend la lecture de la base complète et
//   le rattrapage quand il est atteint (le marché continue).
// ---------------------------------------------------------------------------
const MAX_CLUBS_PER_POST = 10, MAX_PLAYERS = 60, MAX_CLUB_BYTES = 250000, PAGE = 50;
const DB_PAGE_SIZE = 24, DB_AVAIL = ['all', 'transfer', 'loan', 'free'];
// Base complète lue par tranches (poste × fourchette d'OVR) : chaque tranche
// ne fait que quelques pages, donc pas de pages profondes (lentes pour le jeu)
// ni de joueurs qui glissent d'une page à l'autre pendant la lecture. Une
// tranche trop grosse (> DB_SLICE_SPLIT joueurs) est coupée en deux.
const DB_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const DB_BANDS = [[1, 49], [50, 54], [55, 59], [60, 64], [65, 69], [70, 74], [75, 79], [80, 84], [85, 89], [90, 94], [95, 99], [100, 150]];
const DB_SLICE_SPLIT = 240;
const SLICE_RE = /^s:([A-Z]{2,3}):(\d{1,3}):(\d{1,3})$/;
const sliceKey = (pos, min, max) => `s:${pos}:${min}:${max}`;
function parseSlice(a) {
  const m = SLICE_RE.exec(String(a || ''));
  if (!m || !DB_POSITIONS.includes(m[1])) return null;
  const min = +m[2], max = +m[3];
  return min >= 1 && max <= 150 && min <= max ? { pos: m[1], min, max } : null;
}
const DB_MARKET_MS = 55 * 60e3;      // marché et prêts : relus chaque heure
const DB_FULL_MS = 24 * 3600e3;      // base complète : un tour par jour au plus
const DB_LEASE_MS = 10 * 60e3;
const CREST_RE = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]{1,250}$/;
const HISTORY_MAX = 150000; // historique d'OVR brut (caractères JSON)
const REQUEST_TTL = 24 * 3600e3, REQUEST_MAX_PENDING = 300;
const STATS_TTL = 10 * 60e3;
const CATALOG_MAX_PAGES = 20, COUNT_CAP = 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clubs (team_id TEXT PRIMARY KEY, fetched_at INTEGER, updated_at INTEGER, contributor TEXT, players TEXT)`,
  'CREATE TABLE IF NOT EXISTS leases (team_id TEXT PRIMARY KEY, leased_until INTEGER NOT NULL, leased_by TEXT)',
  // Catalogue : une ligne par joueur (fiche complète = club connu, ou légère = base du jeu).
  `CREATE TABLE IF NOT EXISTS site_players (id TEXT PRIMARY KEY, team_id TEXT, light INTEGER NOT NULL, src_at INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL, name_norm TEXT NOT NULL, last_norm TEXT NOT NULL, position TEXT, age INTEGER, overall INTEGER, potential INTEGER,
    transfer_price INTEGER, loan_fee INTEGER, free_agent INTEGER NOT NULL DEFAULT 0, club_name TEXT)`,
  'CREATE INDEX IF NOT EXISTS sp_ovr ON site_players(overall)',
  'CREATE INDEX IF NOT EXISTS sp_pos ON site_players(position, overall)',
  'CREATE INDEX IF NOT EXISTS sp_pot ON site_players(potential)',
  'CREATE INDEX IF NOT EXISTS sp_gap ON site_players((potential - overall))',
  'CREATE INDEX IF NOT EXISTS sp_name ON site_players(name_norm)',
  'CREATE INDEX IF NOT EXISTS sp_last ON site_players(last_norm)',
  'CREATE INDEX IF NOT EXISTS sp_tp ON site_players(transfer_price) WHERE transfer_price > 0',
  'CREATE INDEX IF NOT EXISTS sp_lf ON site_players(loan_fee) WHERE loan_fee > 0',
  // Base du jeu : détail des fiches légères (aucun index secondaire : lecture par id).
  `CREATE TABLE IF NOT EXISTS db_players (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, position TEXT,
    age INTEGER, overall INTEGER, potential INTEGER, value INTEGER, club_id TEXT, club_name TEXT, nationality TEXT, flag_code TEXT,
    free_agent INTEGER, transfer_price INTEGER, loan_fee INTEGER, traits TEXT, attrs TEXT, portrait_url TEXT, seen_at INTEGER NOT NULL)`,
  'DROP INDEX IF EXISTS db_players_name',
  'DROP INDEX IF EXISTS db_players_ovr',
  'DROP INDEX IF EXISTS db_players_pos',
  `CREATE TABLE IF NOT EXISTS db_prices (player_id TEXT NOT NULL, kind TEXT NOT NULL, price INTEGER NOT NULL,
    overall INTEGER, potential INTEGER, age INTEGER, position TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    PRIMARY KEY (player_id, kind, price))`,
  'DROP INDEX IF EXISTS db_prices_seen',
  'CREATE INDEX IF NOT EXISTS db_prices_cmp ON db_prices(position, overall)',
  `CREATE TABLE IF NOT EXISTS db_pages (a TEXT NOT NULL, p INTEGER NOT NULL, done_at INTEGER NOT NULL DEFAULT 0,
    leased_until INTEGER NOT NULL DEFAULT 0, leased_by TEXT, PRIMARY KEY (a, p))`,
  'CREATE INDEX IF NOT EXISTS db_pages_due ON db_pages(a, done_at)',
  // Confirmations du protocole 2 : jamais déduites d'une simple observation.
  `CREATE TABLE IF NOT EXISTS db_page_audits (a TEXT NOT NULL, p INTEGER NOT NULL, task_id TEXT NOT NULL,
    confirmed_at INTEGER NOT NULL, collected_at INTEGER NOT NULL, total INTEGER NOT NULL,
    raw_count INTEGER NOT NULL, ids TEXT NOT NULL, PRIMARY KEY (a, p))`,
  'CREATE TABLE IF NOT EXISTS db_split_receipts (task_id TEXT PRIMARY KEY, a TEXT NOT NULL, completed_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS db_meta (k TEXT PRIMARY KEY, v TEXT)',
  // Demandes du site : « lire ce club en priorité » (fiche légère → complète).
  'CREATE TABLE IF NOT EXISTS site_requests (team_id TEXT PRIMARY KEY, player_id TEXT, requested_at INTEGER NOT NULL)',
  // Fiches complètes lues joueur par joueur (page /gamev2/players/{id} du jeu),
  // y compris les agents libres, et demandes du site par joueur.
  'CREATE TABLE IF NOT EXISTS full_players (id TEXT PRIMARY KEY, team_id TEXT, fetched_at INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS player_requests (player_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL)',
  // Historique d'OVR fourni par le jeu (/api/players/{id}/overall-history), tel quel.
  'CREATE TABLE IF NOT EXISTS player_history (player_id TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, data TEXT NOT NULL)',
  // Clubs connus par leur nom (base du jeu) : recherche « Mon effectif ».
  'CREATE TABLE IF NOT EXISTS site_clubs (team_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS sp_team ON site_players(team_id)',
  // Compte du site → club rattaché. k = empreinte HMAC de l'identifiant Google,
  // calculée par le site : le serveur ne voit jamais l'identifiant lui-même.
  'CREATE TABLE IF NOT EXISTS site_users (k TEXT PRIMARY KEY, team_id TEXT, updated_at INTEGER NOT NULL)',
  // Site appearance, independent of the club link (unlinking must preserve it).
  'CREATE TABLE IF NOT EXISTS site_preferences (k TEXT PRIMARY KEY, appearance TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  // Table des confrontations de styles de jeu, reconstituée à partir des
  // phrases « X a l'avantage sur Y » de l'analyse de match du jeu.
  // Une ligne par (match, gagnant, perdant) : un même match compte une fois.
  'CREATE TABLE IF NOT EXISTS matchups (match_id TEXT NOT NULL, winner TEXT NOT NULL, loser TEXT NOT NULL, seen_at INTEGER NOT NULL, text TEXT, PRIMARY KEY (match_id, winner, loser))',
];
const PLAYSTYLES = ['Balanced', 'Possession', 'Tiki-Taka', 'Direct', 'Counter-attack', 'Gegenpressing',
  'High Tempo', 'Wing Play', 'Long Ball', 'Park the Bus', 'Catenaccio', 'Fluid'];
const dbReady = new WeakSet();
async function ensureDb(env) {
  if (dbReady.has(env.DB)) return;
  await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q)));
  // Colonnes ajoutées après coup (erreur ignorée si elles existent déjà).
  for (const q of ['ALTER TABLE site_clubs ADD COLUMN crest TEXT', 'ALTER TABLE site_players ADD COLUMN value INTEGER',
    'ALTER TABLE site_players ADD COLUMN pos_gain INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE site_players ADD COLUMN pos_best TEXT',
    'ALTER TABLE db_pages ADD COLUMN task_id TEXT'])
    try { await env.DB.prepare(q).run(); } catch (_) {}
  try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS sp_posgain ON site_players(pos_gain) WHERE pos_gain > 0').run(); } catch (_) {}
  await env.DB.batch(['transfer', 'loan'].map(a => env.DB.prepare('INSERT OR IGNORE INTO db_pages (a, p) VALUES (?1, 1)').bind(a)));
  // Passage aux tranches (une seule fois) : la lecture page par page de toute
  // la base (« all ») est remplacée par une page 1 par tranche.
  if (!(await env.DB.prepare("SELECT v FROM db_meta WHERE k = 'slices:v1'").first())) {
    const stmts = [env.DB.prepare("DELETE FROM db_pages WHERE a = 'all'"), env.DB.prepare("DELETE FROM db_meta WHERE k = 'total:all'")];
    for (const pos of DB_POSITIONS) for (const [min, max] of DB_BANDS)
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO db_pages (a, p) VALUES (?1, 1)').bind(sliceKey(pos, min, max)));
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO db_meta (k, v) VALUES ('slices:v1', '1')"));
    await env.DB.batch(stmts);
  }
  dbReady.add(env.DB);
}

// --- Budget d'écritures du jour ----------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
const paid = (env) => env.D1_PAID === '1';
const writeBudget = (env) => paid(env) ? Infinity : Math.max(1000, parseInt(env.DAILY_WRITE_BUDGET || '70000', 10) || 70000);
// Compteur en mémoire de l'isolat (relu en base au plus une fois par minute).
const writesMemByDb = new WeakMap();
const mem = (env) => { let m = writesMemByDb.get(env.DB); if (!m) writesMemByDb.set(env.DB, m = { day: '', n: 0, synced: 0 }); return m; };
async function writesToday(env) {
  const d = today(), m = mem(env);
  if (m.day !== d || Date.now() - m.synced > 60e3) {
    const r = await env.DB.prepare('SELECT v FROM db_meta WHERE k = ?1').bind('writes:' + d).first();
    Object.assign(m, { n: Math.max(m.day === d ? m.n : 0, r ? +r.v : 0), day: d, synced: Date.now() });
  }
  return m.n;
}
// Exécute un lot (découpé par 400) et compte les lignes réellement écrites.
async function runBatch(env, stmts) {
  let written = 0;
  for (let i = 0; i < stmts.length; i += 400) {
    const res = await env.DB.batch(stmts.slice(i, i + 400));
    for (const r of res) written += (r && r.meta && (r.meta.rows_written ?? r.meta.changes)) || 0;
  }
  if (written > 0) {
    const d = today(), m = mem(env);
    if (m.day !== d) Object.assign(m, { day: d, n: 0, synced: 0 });
    m.n += written;
    await env.DB.prepare(`INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + CAST(?2 AS INTEGER)`)
      .bind('writes:' + d, written).run();
  }
  return written;
}

// --- Noms -------------------------------------------------------------------
const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Nom de club pour la recherche : sans accents, apostrophes, tirets, points ni espaces
// (« L’Icaunique », « L'Icaunique » et « licaunique » se retrouvent).
const normClub = (s) => normName(s).replace(/[\s'’‘`´"“”«»\-_.·,]+/g, '');
const lastToken = (s) => { const t = normName(s).split(/\s+/).filter(Boolean); return t.length ? t[t.length - 1] : ''; };
const isStr = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const int = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// --- Upserts conditionnels -----------------------------------------------------
// Joueur d'un effectif complet (club lu par l'extension).
function upsertFull(env, p, teamId, fetchedAt) {
  const pg = positionGain(p.attributes, p.position);
  const value = isNum(p.value, 0, 1e12) ? Math.round(p.value) : null;
  return env.DB.prepare(`INSERT INTO site_players (id, team_id, light, src_at, name, name_norm, last_norm, position, age, overall, potential, value, pos_gain, pos_best)
      VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(id) DO UPDATE SET team_id = excluded.team_id, light = 0, src_at = excluded.src_at, name = excluded.name,
      name_norm = excluded.name_norm, last_norm = excluded.last_norm, position = excluded.position, age = excluded.age,
      overall = excluded.overall, potential = excluded.potential, value = COALESCE(excluded.value, site_players.value),
      pos_gain = excluded.pos_gain, pos_best = excluded.pos_best
    WHERE site_players.light = 1 OR (excluded.src_at >= site_players.src_at AND (site_players.team_id IS NOT excluded.team_id
      OR site_players.name IS NOT excluded.name OR site_players.position IS NOT excluded.position OR site_players.age IS NOT excluded.age
      OR site_players.overall IS NOT excluded.overall OR site_players.potential IS NOT excluded.potential
      OR site_players.pos_gain IS NOT excluded.pos_gain OR (excluded.value IS NOT NULL AND site_players.value IS NOT excluded.value)))`)
    .bind(p.id, teamId, fetchedAt, p.name, normName(p.name), lastToken(p.name), String(p.position || ''), int(p.age), int(p.overall), int(p.potential),
      value, pg.gain, pg.best);
}
// --- Gain d'OVR en changeant de poste (carte de poste) ----------------------------
// Même formule que le jeu : OVR = floor((Σ poids% × stat + 50) / 100) avec les
// poids de la famille du poste. On compare la famille actuelle à la meilleure.
const POS_WEIGHTS = {
  CB: [11, 3, 13, 4, 37, 32], FB: [25, 5, 15, 15, 25, 15], CDM: [10, 5, 25, 10, 30, 20], CM: [13, 13, 27, 17, 17, 13],
  CAM: [13, 18, 27, 24, 9, 9], WM: [24, 13, 20, 24, 10, 9], W: [28, 19, 14, 28, 5, 6], ST: [25, 30, 10, 20, 3, 12],
};
const POS_FAMILY = { CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'CDM', CM: 'CM', CAM: 'CAM', LM: 'WM', RM: 'WM', LW: 'W', RW: 'W', CF: 'ST', ST: 'ST' };
const FAMILY_LABEL = { CB: 'CB', FB: 'LB/RB', CDM: 'CDM', CM: 'CM', CAM: 'CAM', WM: 'LM/RM', W: 'LW/RW', ST: 'ST' };
const STAT_SUBS = {
  pac: ['acceleration', 'sprintSpeed'], sho: ['finishing', 'shotPower', 'longShots', 'volleys', 'penalties', 'attackingPositioning'],
  pas: ['vision', 'crossing', 'fkAccuracy', 'shortPassing', 'longPassing', 'curve'],
  dri: ['agility', 'balance', 'reactions', 'ballControl', 'dribblingSub', 'composure'],
  def: ['interceptions', 'headingAccuracy', 'defensiveAwareness', 'standingTackle', 'slidingTackle'],
  phy: ['jumping', 'stamina', 'strength', 'aggression'],
};
export function positionGain(attrs, position) {
  const fam = POS_FAMILY[String(position || '')];
  if (!fam || !attrs || typeof attrs !== 'object') return { gain: 0, best: null };
  const stats = Object.entries(STAT_SUBS).map(([k, subs]) => {
    if (isNum(attrs[k], 0, 250)) return attrs[k];
    const v = subs.map(s => attrs[s]).filter(x => isNum(x, 0, 250));
    return v.length === subs.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  });
  if (stats.some(v => v == null)) return { gain: 0, best: null };
  const ovr = (f) => Math.floor((POS_WEIGHTS[f].reduce((sum, w, i) => sum + w * stats[i], 0) + 50) / 100);
  const own = ovr(fam);
  let best = fam, top = own;
  for (const f of Object.keys(POS_WEIGHTS)) if (ovr(f) > top) { top = ovr(f); best = f; }
  return top > own ? { gain: top - own, best: FAMILY_LABEL[best] } : { gain: 0, best: null };
}

// Nom de club (n'écrit que s'il change).
function upsertClubName(env, id, name, now) {
  return env.DB.prepare(`INSERT INTO site_clubs (team_id, name, name_norm, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(team_id) DO UPDATE SET name = excluded.name, name_norm = excluded.name_norm, updated_at = excluded.updated_at
    WHERE site_clubs.name IS NOT excluded.name OR site_clubs.name_norm IS NOT excluded.name_norm`).bind(id, name, normClub(name), now);
}
// Joueur de la base du jeu : fiche légère, et prix pour tout le monde.
function upsertLight(env, x) {
  const tp = x.transfer_price > 0 ? Math.round(x.transfer_price) : null, lf = x.loan_fee > 0 ? Math.round(x.loan_fee) : null;
  const club = x.free_agent ? null : (isStr(x.club_id, 64) ? x.club_id : null);
  const pg = positionGain(x.attributes, x.position);
  const value = isNum(x.value, 0, 1e12) ? Math.round(x.value) : null;
  return env.DB.prepare(`INSERT INTO site_players (id, team_id, light, name, name_norm, last_norm, position, age, overall, potential,
      transfer_price, loan_fee, free_agent, club_name, value, pos_gain, pos_best) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
    ON CONFLICT(id) DO UPDATE SET
      value = CASE WHEN site_players.light = 1 OR site_players.value IS NULL THEN excluded.value ELSE site_players.value END,
      pos_gain = CASE WHEN site_players.light = 1 THEN excluded.pos_gain ELSE site_players.pos_gain END,
      pos_best = CASE WHEN site_players.light = 1 THEN excluded.pos_best ELSE site_players.pos_best END,
      team_id = CASE WHEN site_players.light = 1 THEN excluded.team_id ELSE site_players.team_id END,
      name = CASE WHEN site_players.light = 1 THEN excluded.name ELSE site_players.name END,
      name_norm = CASE WHEN site_players.light = 1 THEN excluded.name_norm ELSE site_players.name_norm END,
      last_norm = CASE WHEN site_players.light = 1 THEN excluded.last_norm ELSE site_players.last_norm END,
      position = CASE WHEN site_players.light = 1 THEN excluded.position ELSE site_players.position END,
      age = CASE WHEN site_players.light = 1 THEN excluded.age ELSE site_players.age END,
      overall = CASE WHEN site_players.light = 1 THEN excluded.overall ELSE site_players.overall END,
      potential = CASE WHEN site_players.light = 1 THEN excluded.potential ELSE site_players.potential END,
      transfer_price = excluded.transfer_price, loan_fee = excluded.loan_fee, free_agent = excluded.free_agent, club_name = excluded.club_name
    WHERE site_players.transfer_price IS NOT excluded.transfer_price OR site_players.loan_fee IS NOT excluded.loan_fee
      OR site_players.free_agent IS NOT excluded.free_agent OR site_players.club_name IS NOT excluded.club_name
      OR (site_players.value IS NULL AND excluded.value IS NOT NULL)
      OR (site_players.light = 1 AND (site_players.value IS NOT excluded.value OR site_players.pos_gain IS NOT excluded.pos_gain))
      OR (site_players.light = 1 AND (site_players.team_id IS NOT excluded.team_id OR site_players.name IS NOT excluded.name
        OR site_players.position IS NOT excluded.position OR site_players.age IS NOT excluded.age
        OR site_players.overall IS NOT excluded.overall OR site_players.potential IS NOT excluded.potential))`)
    .bind(x.id, club, x.name, normName(x.name), lastToken(x.name), x.position, x.age, x.overall, x.potential, tp, lf,
      x.free_agent ? 1 : 0, isStr(x.club_name, 80) ? x.club_name : null, value, pg.gain, pg.best);
}
function upsertDbDetail(env, x, now) {
  const tp = x.transfer_price > 0 ? Math.round(x.transfer_price) : null, lf = x.loan_fee > 0 ? Math.round(x.loan_fee) : null;
  const traits = JSON.stringify(Array.isArray(x.traits) ? x.traits.filter(t => isStr(t, 40)).slice(0, 8) : []);
  const attrs = JSON.stringify(x.attributes || {});
  return env.DB.prepare(`INSERT INTO db_players (id, name, name_norm, position, age, overall, potential, value, club_id, club_name,
      nationality, flag_code, free_agent, transfer_price, loan_fee, traits, attrs, portrait_url, seen_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_norm=excluded.name_norm, position=excluded.position, age=excluded.age,
      overall=excluded.overall, potential=excluded.potential, value=excluded.value, club_id=excluded.club_id, club_name=excluded.club_name,
      nationality=excluded.nationality, flag_code=excluded.flag_code, free_agent=excluded.free_agent, transfer_price=excluded.transfer_price,
      loan_fee=excluded.loan_fee, traits=excluded.traits, attrs=excluded.attrs, portrait_url=excluded.portrait_url, seen_at=excluded.seen_at
    WHERE db_players.overall IS NOT excluded.overall OR db_players.potential IS NOT excluded.potential OR db_players.age IS NOT excluded.age
      OR db_players.value IS NOT excluded.value OR db_players.club_id IS NOT excluded.club_id OR db_players.free_agent IS NOT excluded.free_agent
      OR db_players.transfer_price IS NOT excluded.transfer_price OR db_players.loan_fee IS NOT excluded.loan_fee
      OR db_players.attrs IS NOT excluded.attrs OR db_players.traits IS NOT excluded.traits OR db_players.position IS NOT excluded.position`)
    .bind(x.id, x.name, normName(x.name), x.position, x.age, x.overall, x.potential, int(x.value), isStr(x.club_id, 64) ? x.club_id : null,
      isStr(x.club_name, 80) ? x.club_name : null, isStr(x.nationality, 60) ? x.nationality : null, isStr(x.flag_code, 4) ? x.flag_code : null,
      x.free_agent ? 1 : 0, tp, lf, traits, attrs, isStr(x.portrait_url, 300) ? x.portrait_url : null, now);
}
function upsertPrice(env, x, kind, price, now) {
  // last_seen n'est rafraîchi qu'une fois toutes les 6 h (économie d'écritures).
  return env.DB.prepare(`INSERT INTO db_prices (player_id, kind, price, overall, potential, age, position, first_seen, last_seen)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
    ON CONFLICT(player_id, kind, price) DO UPDATE SET last_seen = excluded.last_seen
    WHERE excluded.last_seen > db_prices.last_seen + 21600000`)
    .bind(x.id, kind, Math.round(price), x.overall, x.potential, x.age, x.position, now);
}

// --- Fiches publiques ------------------------------------------------------------
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
const marketOf = (s) => s ? {
  transferPrice: s.transfer_price ?? null, loanFee: s.loan_fee ?? null, freeAgent: !!s.free_agent, clubName: s.club_name ?? null,
} : null;

// Joueur complet : une ligne de site_players, puis la ligne du club et/ou la
// fiche lue seule (la plus récente des deux).
async function findPlayer(env, id) {
  const s = await env.DB.prepare('SELECT * FROM site_players WHERE id = ?1').bind(id).first();
  if (s && !s.light) {
    let best = null;
    if (s.team_id) {
      const c = await env.DB.prepare('SELECT fetched_at, players FROM clubs WHERE team_id = ?1').bind(s.team_id).first();
      const raw = c ? JSON.parse(c.players).find(p => p && p.id === id) : null;
      if (raw) best = { raw, at: c.fetched_at, team: s.team_id };
    }
    const f = await env.DB.prepare('SELECT team_id, fetched_at, data FROM full_players WHERE id = ?1').bind(id).first();
    if (f && (!best || f.fetched_at > best.at)) best = { raw: JSON.parse(f.data), at: f.fetched_at, team: f.team_id || s.team_id };
    if (best) return { s, player: publicPlayer({ data: best.raw, team_id: best.team }), fetchedAt: best.at, light: false };
  }
  const d = await env.DB.prepare('SELECT * FROM db_players WHERE id = ?1').bind(id).first();
  if (d) return { s, d, player: dbPublicPlayer(d), fetchedAt: d.seen_at, light: true };
  return null;
}

// --- Catalogue : filtres traduits en requêtes indexées ------------------------------
const SITE_SORTS = {
  overall: 'overall DESC', potential: 'potential DESC', gap: '(potential - overall) DESC',
  price: 'transfer_price ASC', loan: 'loan_fee ASC',
  // Réservés (le site ne les propose qu'aux comptes autorisés).
  posgain: 'pos_gain DESC, overall DESC',
  bargain: '(value - transfer_price) DESC',
};
function catalogWhere(params) {
  const where = [], args = [];
  const add = (sql, ...vals) => { const base = args.length; let i = 0; args.push(...vals); where.push(sql.replace(/\?(?!\d)/g, () => '?' + (base + ++i))); };
  const q = normName(params.q || '').slice(0, 60);
  if (q.length >= 2) {
    const hi = q + '￿';
    add('((name_norm >= ? AND name_norm < ?) OR (last_norm >= ? AND last_norm < ?) OR id = ?)', q, hi, q, hi, String(params.q).trim());
  }
  if (/^[A-Z]{2,3}$/.test(params.position || '')) add('position = ?', params.position);
  const num = (k) => { const v = parseInt(params[k] ?? '', 10); return Number.isFinite(v) ? v : null; };
  for (const [k, sql] of [['ageMin', 'age >= ?'], ['ageMax', 'age <= ?'], ['ovrMin', 'overall >= ?'], ['ovrMax', 'overall <= ?'],
    ['potMin', 'potential >= ?'], ['potMax', 'potential <= ?'], ['gapMin', '(potential - overall) >= ?'], ['priceMax', 'transfer_price <= ?']])
    if (num(k) != null) add(sql, num(k));
  const sort = SITE_SORTS[params.sort] ? params.sort : 'overall';
  // Index partiels : un tri par prix ne montre que les joueurs à vendre / en prêt.
  if (params.avail === 'transfer' || sort === 'price' || sort === 'bargain' || num('priceMax') != null) where.push('transfer_price > 0');
  if (sort === 'bargain') where.push('value > transfer_price');
  if (sort === 'posgain') where.push('pos_gain > 0');
  if (params.avail === 'loan' || sort === 'loan') where.push('loan_fee > 0');
  if (params.avail === 'free') where.push('free_agent = 1');
  if (params.avail === 'full') where.push('light = 0');
  return { W: where.length ? 'WHERE ' + where.join(' AND ') : '', args, order: SITE_SORTS[sort], filtered: where.length > 0 };
}
async function catalog(env, params, limit) {
  const { W, args, order, filtered } = catalogWhere(params);
  const page = Math.min(CATALOG_MAX_PAGES, Math.max(1, parseInt(params.page || '1', 10) || 1));
  let total, capped = false;
  if (!filtered) total = (await env.DB.prepare('SELECT MAX(rowid) AS n FROM site_players').first())?.n || 0;
  else {
    total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM site_players ${W} LIMIT ${COUNT_CAP + 1})`).bind(...args).first()).n;
    if (total > COUNT_CAP) { total = COUNT_CAP; capped = true; }
  }
  const { results } = await env.DB.prepare(`SELECT * FROM site_players ${W} ORDER BY ${order}, id LIMIT ${limit} OFFSET ${(page - 1) * limit}`)
    .bind(...args).all();
  return { results, total, capped: capped || (!filtered && total > CATALOG_MAX_PAGES * limit), page,
    pages: Math.min(CATALOG_MAX_PAGES, Math.ceil(total / limit)) };
}

async function siteRequest(req, env, url, json) {
  if (!env.SITE_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.SITE_TOKEN}`)
    return json({ error: 'Accès site non autorisé' }, 401);
  const requestPrefix = '/v1/site/request/', statusPrefix = '/v1/site/status/', playerPrefix = '/v1/site/player/';
  const isRequest = url.pathname.startsWith(requestPrefix);
  const isPreferences = url.pathname.startsWith('/v1/site/preferences/');
  const isClub = url.pathname.startsWith('/v1/site/me/') || url.pathname === '/v1/site/clubs' || url.pathname.startsWith('/v1/site/club/');
  if (!isClub && !isPreferences && req.method !== (isRequest ? 'POST' : 'GET')) return json({ error: isRequest ? 'POST attendu' : 'Lecture seule' }, 405);
  if (env.SITE_RATE_LIMITER) {
    try {
      const { success } = await env.SITE_RATE_LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || 'site' });
      if (!success) return json({ error: 'Trop de requêtes' }, 429);
    } catch (_) { /* limiteur indisponible : on continue */ }
  }
  if (isClub) return siteClubRequest(req, env, url, json);
  if (isPreferences) return sitePreferencesRequest(req, env, url, json);
  await ensureDb(env);
  const idFrom = (prefix) => { try { const id = decodeURIComponent(url.pathname.slice(prefix.length)); return isStr(id, 128) ? id : null; } catch { return null; } };

  // Demande de fiche complète : le joueur (et son club, pour les anciennes
  // extensions) passe en tête de ce qui est confié aux extensions (/v1/assign).
  // Seule écriture possible du site.
  if (isRequest || url.pathname.startsWith(statusPrefix)) {
    const id = idFrom(isRequest ? requestPrefix : statusPrefix);
    if (!id) return json({ error: 'Identifiant invalide' }, 400);
    const s = await env.DB.prepare('SELECT team_id, light, free_agent FROM site_players WHERE id = ?1').bind(id).first();
    if (!s) return json({ error: 'Joueur introuvable' }, 404);
    const full = !s.light;
    const now = Date.now();
    const r = await env.DB.prepare('SELECT requested_at FROM player_requests WHERE player_id = ?1').bind(id).first();
    const pending = r && now - r.requested_at < REQUEST_TTL && !full;
    if (!isRequest) {
      const f = full ? await env.DB.prepare('SELECT fetched_at FROM full_players WHERE id = ?1').bind(id).first() : null;
      const c = full && !f && s.team_id ? await env.DB.prepare('SELECT fetched_at FROM clubs WHERE team_id = ?1').bind(s.team_id).first() : null;
      return json({ light: !full, fetchedAt: (f || c || {}).fetched_at ?? null, requestedAt: pending ? r.requested_at : null });
    }
    if (full) return json({ light: false, status: 'complet' });
    if (pending) return json({ light: true, status: 'deja-demande', requestedAt: r.requested_at });
    const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM player_requests WHERE requested_at > ?1 LIMIT ${REQUEST_MAX_PENDING})`)
      .bind(now - REQUEST_TTL).first()).n;
    if (n >= REQUEST_MAX_PENDING) return json({ error: 'Trop de demandes en attente, réessaie plus tard.' }, 429);
    const stmts = [env.DB.prepare(`INSERT INTO player_requests (player_id, requested_at) VALUES (?1, ?2)
      ON CONFLICT(player_id) DO UPDATE SET requested_at = excluded.requested_at`).bind(id, now)];
    if (s.team_id && !s.free_agent) stmts.push(env.DB.prepare(`INSERT INTO site_requests (team_id, player_id, requested_at) VALUES (?1, ?2, ?3)
      ON CONFLICT(team_id) DO UPDATE SET player_id = excluded.player_id, requested_at = excluded.requested_at`).bind(s.team_id, id, now));
    await runBatch(env, stmts);
    return json({ light: true, status: 'demande', requestedAt: now });
  }

  if (url.pathname.startsWith(playerPrefix)) {
    const id = idFrom(playerPrefix);
    if (!id) return json({ error: 'Identifiant invalide' }, 400);
    const found = await findPlayer(env, id);
    if (!found) return json({ error: 'Joueur introuvable' }, 404);
    const { s, player } = found;
    const prices = (await env.DB.prepare(`SELECT kind, price, overall, potential, age, first_seen, last_seen FROM db_prices
      WHERE player_id = ?1 ORDER BY first_seen DESC LIMIT 50`).bind(id).all()).results;
    // Prix demandés de joueurs comparables (même poste, OVR ±2, âge ±2, 30 derniers jours).
    const comparables = Number.isFinite(player.overall) && Number.isFinite(player.age) ? (await env.DB.prepare(`SELECT kind, price, overall, potential, age, last_seen
      FROM db_prices WHERE position = ?1 AND overall BETWEEN ?2 AND ?3 AND age BETWEEN ?4 AND ?5 AND last_seen > ?6 AND player_id != ?7
      ORDER BY last_seen DESC LIMIT 300`).bind(String(player.position), player.overall - 2, player.overall + 2, player.age - 2, player.age + 2,
      Date.now() - 30 * 864e5, id).all()).results : [];
    const h = await env.DB.prepare('SELECT fetched_at, data FROM player_history WHERE player_id = ?1').bind(id).first();
    let history = null; try { history = h ? JSON.parse(h.data) : null; } catch (_) {}
    // Club actuel : nom connu par la base du jeu (agent libre : pas de club).
    const teamId = (s && s.team_id) || player.club_id || '';
    const freeAgent = !!((s && s.free_agent) || (found.d && found.d.free_agent));
    const c = teamId && !freeAgent ? await env.DB.prepare('SELECT name, crest FROM site_clubs WHERE team_id = ?1').bind(teamId).first() : null;
    const clubName = freeAgent ? null : (c && c.name) || (s && s.club_name) || (found.d && found.d.club_name) || player.club_name || null;
    return json({ player, fetchedAt: found.fetchedAt, teamId, light: found.light,
      club: freeAgent ? { id: '', name: null, freeAgent: true, crest: null } : teamId || clubName ? { id: teamId, name: clubName, freeAgent: false, crest: (c && c.crest) || null } : null,
      market: marketOf(s || found.d), prices, comparables, history, historyAt: h ? h.fetched_at : null });
  }

  if (!['/v1/site/players', '/v1/site/search'].includes(url.pathname)) return json({ error: 'Introuvable' }, 404);
  const params = Object.fromEntries(url.searchParams);
  const search = url.pathname.endsWith('/search');
  if (search && normName(params.q || '').length < 3) return json({ players: [], total: 0, page: 1, pages: 0 });
  const c = await catalog(env, params, search ? 10 : 50);
  return json({ players: c.results.map(row => ({
    player: { id: row.id, name: row.name, position: row.position, age: row.age, overall: row.overall, potential: row.potential },
    fetchedAt: row.src_at || 0, teamId: row.team_id || '', light: !!row.light, market: marketOf(row),
    value: row.value ?? null, posGain: row.pos_gain || 0, posBest: row.pos_best || null,
  })), total: c.total, capped: c.capped, page: c.page, pages: c.pages });
}

async function sitePreferencesRequest(req, env, url, json) {
  let k; try { k = decodeURIComponent(url.pathname.slice('/v1/site/preferences/'.length)); } catch (_) { k = ''; }
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(k)) return json({ error: 'Clé invalide' }, 400);
  if (!['GET', 'PUT'].includes(req.method)) return json({ error: 'GET ou PUT attendu' }, 405);
  await ensureDb(env);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT appearance FROM site_preferences WHERE k = ?').bind(k).first();
    return json({ appearance: row?.appearance ?? null });
  }
  let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
  if (!body || !Object.hasOwn(body, 'appearance') || ![null, 'light', 'dark', 'manga'].includes(body.appearance))
    return json({ error: 'Apparence invalide' }, 400);
  if (body.appearance === null) await env.DB.prepare('DELETE FROM site_preferences WHERE k = ?').bind(k).run();
  else await env.DB.prepare(`INSERT INTO site_preferences (k, appearance, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(k) DO UPDATE SET appearance = excluded.appearance, updated_at = excluded.updated_at`).bind(k, body.appearance, Date.now()).run();
  return json({ appearance: body.appearance });
}

// --- « Mon effectif » : clubs et compte du site ------------------------------------
const CLUB_STALE_MS = 24 * 3600e3;
async function siteClubRequest(req, env, url, json) {
  await ensureDb(env);
  const now = Date.now();
  const tail = (prefix) => { try { return decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return ''; } };

  // Club rattaché au compte (k = empreinte calculée par le site).
  if (url.pathname.startsWith('/v1/site/me/')) {
    const k = tail('/v1/site/me/');
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(k)) return json({ error: 'Clé invalide' }, 400);
    if (req.method === 'GET') {
      const u = await env.DB.prepare('SELECT team_id FROM site_users WHERE k = ?1').bind(k).first();
      return json({ teamId: (u && u.team_id) || null });
    }
    if (req.method !== 'PUT') return json({ error: 'GET ou PUT attendu' }, 405);
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const teamId = body && body.teamId == null ? null : (isStr(body && body.teamId, 64) ? body.teamId : undefined);
    if (teamId === undefined) return json({ error: 'Club invalide' }, 400);
    if (teamId === null) await env.DB.prepare('DELETE FROM site_users WHERE k = ?1').bind(k).run();
    else await env.DB.prepare(`INSERT INTO site_users (k, team_id, updated_at) VALUES (?1, ?2, ?3)
      ON CONFLICT(k) DO UPDATE SET team_id = excluded.team_id, updated_at = excluded.updated_at`).bind(k, teamId, now).run();
    return json({ teamId });
  }
  if (req.method !== 'GET') return json({ error: 'Lecture seule' }, 405);

  // Recherche de club par nom.
  if (url.pathname === '/v1/site/clubs') {
    const q = normClub(url.searchParams.get('q') || '').slice(0, 60);
    if (q.length < 2) return json({ clubs: [] });
    // Première recherche : on remplit la table des noms depuis le catalogue,
    // puis (v2) on recalcule les noms normalisés. Une seule fois chacun.
    if (!(await env.DB.prepare("SELECT v FROM db_meta WHERE k = 'clubs:v1'").first())) {
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO site_clubs (team_id, name, name_norm, updated_at)
          SELECT team_id, MAX(club_name), '', ?1 FROM site_players WHERE team_id IS NOT NULL AND club_name IS NOT NULL GROUP BY team_id`).bind(now),
        env.DB.prepare("INSERT OR IGNORE INTO db_meta (k, v) VALUES ('clubs:v1', '1')"),
      ]);
    }
    if (!(await env.DB.prepare("SELECT v FROM db_meta WHERE k = 'clubs:v2'").first())) {
      const all = (await env.DB.prepare('SELECT team_id, name, name_norm FROM site_clubs').all()).results
        .filter(c => c.name_norm !== normClub(c.name));
      for (let i = 0; i < all.length; i += 200)
        await env.DB.batch(all.slice(i, i + 200).map(c => env.DB.prepare('UPDATE site_clubs SET name_norm = ?2 WHERE team_id = ?1').bind(c.team_id, normClub(c.name))));
      await env.DB.prepare("INSERT OR IGNORE INTO db_meta (k, v) VALUES ('clubs:v2', '1')").run();
    }
    const like = '%' + q.replace(/[%_\\]/g, m => '\\' + m) + '%';
    const { results } = await env.DB.prepare(`SELECT c.team_id, c.name, k.fetched_at FROM site_clubs c LEFT JOIN clubs k ON k.team_id = c.team_id
      WHERE c.name_norm LIKE ?1 ESCAPE '\\' ORDER BY (c.name_norm LIKE ?2 ESCAPE '\\') DESC, c.name LIMIT 20`)
      .bind(like, like.slice(1)).all();
    return json({ clubs: results.map(r => ({ teamId: r.team_id, name: r.name, fetchedAt: r.fetched_at ?? null })) });
  }

  // Effectif d'un club : fiche complète (instantané du club) si connue,
  // sinon fiches légères de la base du jeu. Instantané absent ou vieux d'un
  // jour : le club passe en tête de ce qui est confié aux extensions.
  const teamId = tail('/v1/site/club/');
  if (!isStr(teamId, 64)) return json({ error: 'Identifiant invalide' }, 400);
  const [c, n] = await Promise.all([
    env.DB.prepare('SELECT fetched_at, players FROM clubs WHERE team_id = ?1').bind(teamId).first(),
    env.DB.prepare('SELECT name, crest FROM site_clubs WHERE team_id = ?1').bind(teamId).first(),
  ]);
  let players = [];
  if (c) {
    let raws = [];
    try { raws = JSON.parse(c.players).filter(validPlayer); } catch (_) {}
    // Fiche lue joueur par joueur plus récente que l'instantané du club : on la
    // préfère (sinon l'effectif montre un OVR, des sous-attributs et des coûts
    // d'entraînement en retard sur la fiche du joueur).
    const newer = new Map();
    for (let i = 0; i < raws.length; i += 90) {
      const part = raws.slice(i, i + 90).map(r => r.id);
      (await env.DB.prepare(`SELECT id, data FROM full_players WHERE fetched_at > ?1 AND id IN (${part.map((_, k) => '?' + (k + 2)).join(',')})`)
        .bind(c.fetched_at, ...part).all()).results.forEach(r => { try { newer.set(r.id, JSON.parse(r.data)); } catch (_) {} });
    }
    players = raws.map(raw => ({ player: publicPlayer({ data: newer.get(raw.id) || raw, team_id: teamId }), light: false }));
  }
  if (!players.length) {
    const ids = (await env.DB.prepare('SELECT id FROM site_players WHERE team_id = ?1 LIMIT 80').bind(teamId).all()).results.map(r => r.id);
    if (ids.length) {
      const rows = (await env.DB.prepare(`SELECT * FROM db_players WHERE id IN (${ids.map((_, i) => '?' + (i + 1)).join(',')})`).bind(...ids).all()).results;
      players = rows.map(d => ({ player: dbPublicPlayer(d), light: true }));
    }
  }
  if (!c && !n && !players.length) return json({ error: 'Club inconnu' }, 404);
  let requestedAt = null;
  if (!c || now - c.fetched_at > CLUB_STALE_MS) {
    const r = await env.DB.prepare('SELECT requested_at FROM site_requests WHERE team_id = ?1').bind(teamId).first();
    if (r && now - r.requested_at < REQUEST_TTL) requestedAt = r.requested_at;
    else {
      await env.DB.prepare(`INSERT INTO site_requests (team_id, player_id, requested_at) VALUES (?1, NULL, ?2)
        ON CONFLICT(team_id) DO UPDATE SET player_id = NULL, requested_at = excluded.requested_at`).bind(teamId, now).run();
      requestedAt = now;
    }
  }
  return json({ teamId, name: (n && n.name) || null, crest: (n && n.crest) || null, fetchedAt: c ? c.fetched_at : null, requestedAt, players });
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

// --- Rattrapage : remplit site_players depuis les données existantes ----------------
// Tâche planifiée (toutes les 5 min) : quelques clubs puis quelques fiches de la
// base du jeu à chaque passage, dans la limite du budget d'écritures du jour.
export async function backfillStep(env) {
  await ensureDb(env);
  const meta = async (k) => (await env.DB.prepare('SELECT v FROM db_meta WHERE k = ?1').bind(k).first())?.v ?? null;
  const setMeta = (k, v) => env.DB.prepare('INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v));
  if ((await meta('bf:done')) === '1') return { done: true };
  if (await writesToday(env) >= writeBudget(env)) return { paused: 'budget' };
  const clubsPerRun = paid(env) ? 60 : Math.max(1, parseInt(env.BACKFILL_CLUBS || '2', 10) || 2);
  const cursor = (await meta('bf:club')) || '';
  if (cursor !== '~') {
    const { results } = await env.DB.prepare('SELECT team_id, fetched_at, players FROM clubs WHERE team_id > ?1 ORDER BY team_id LIMIT ?2')
      .bind(cursor, clubsPerRun).all();
    const stmts = [];
    for (const c of results) {
      let players = []; try { players = JSON.parse(c.players); } catch (_) {}
      for (const p of players) if (p && isStr(p.id, 64) && isStr(p.name, 80)) stmts.push(upsertFull(env, p, c.team_id, c.fetched_at || 0));
    }
    stmts.push(setMeta('bf:club', results.length < clubsPerRun ? '~' : results[results.length - 1].team_id));
    return { clubs: results.length, written: await runBatch(env, stmts) };
  }
  const dcur = (await meta('bf:db')) || '';
  const n = paid(env) ? 2000 : 100;
  const { results } = await env.DB.prepare('SELECT * FROM db_players WHERE id > ?1 ORDER BY id LIMIT ?2').bind(dcur, n).all();
  const stmts = results.map(d => upsertLight(env, { ...d, club_id: d.club_id }));
  stmts.push(results.length < n ? setMeta('bf:done', '1') : setMeta('bf:db', results[results.length - 1].id));
  return { db: results.length, written: await runBatch(env, stmts) };
}

const statsCacheByDb = new WeakMap();
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(backfillStep(env).catch(() => {}));
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
    if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true, collectorProtocol: 2 });
    if (req.method === 'GET' && url.pathname === '/privacy') {
      return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    try {
      if (url.pathname.startsWith('/v1/site/')) return await siteRequest(req, env, url, json);
      return await extensionRequest(req, env, url, json);
    } catch (e) {
      const msg = String(e && e.message || e);
      console.error(`${req.method} ${url.pathname} : ${msg}`);
      const quota = /limit|exceeded/i.test(msg);
      return json({ error: quota ? 'Quota journalier de la base atteint, réessaie après minuit UTC.' : 'Erreur serveur', detail: msg.slice(0, 200) }, quota ? 503 : 500);
    }
  },
};

async function extensionRequest(req, env, url, json) {
  const installId = req.headers.get('X-GMC-Install');
  if (!(await licenceOk(env, installId, req.headers.get('X-GMC-Licence')))) return json({ error: 'licence invalide ou expirée' }, 401);
  await ensureDb(env);
  const now = Date.now();

  // Envoi d'effectifs : on ne garde que la version la plus récente de chaque club,
  // et le catalogue (site_players) n'est réécrit que pour ce qui a changé.
  if (req.method === 'POST' && url.pathname === '/v1/clubs') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const clubs = Array.isArray(body.clubs) ? body.clubs.slice(0, MAX_CLUBS_PER_POST) : [];
    let accepted = 0, rejected = 0;
    const valid = [];
    for (const c of clubs) {
      const players = Array.isArray(c.players) ? c.players : null;
      const text = players ? JSON.stringify(players) : '';
      if (!isStr(c.teamId, 64) || !isInt(c.fetchedAt, 1.6e12, now + 5 * 60e3) || !players || !players.length ||
          players.length > MAX_PLAYERS || !players.every(validPlayer) || text.length > MAX_CLUB_BYTES) { rejected++; continue; }
      valid.push({ c, text });
    }
    const known = new Map();
    if (valid.length) {
      const ph = valid.map((_, i) => '?' + (i + 1)).join(',');
      (await env.DB.prepare(`SELECT team_id, fetched_at FROM clubs WHERE team_id IN (${ph})`).bind(...valid.map(v => v.c.teamId)).all())
        .results.forEach(r => known.set(r.team_id, r.fetched_at));
    }
    const stmts = [];
    for (const { c, text } of valid) {
      accepted++;
      if (known.has(c.teamId) && known.get(c.teamId) >= c.fetchedAt) continue; // déjà plus récent
      stmts.push(env.DB.prepare(
        `INSERT INTO clubs (team_id, fetched_at, updated_at, contributor, players) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(team_id) DO UPDATE SET fetched_at = excluded.fetched_at, updated_at = excluded.updated_at,
           contributor = excluded.contributor, players = excluded.players
         WHERE excluded.fetched_at > clubs.fetched_at`).bind(c.teamId, c.fetchedAt, now, installId || null, text));
      for (const p of c.players) stmts.push(upsertFull(env, p, c.teamId, c.fetchedAt));
    }
    // Logo du club (n'écrit que s'il change ; le nom vient de la base du jeu).
    for (const { c } of valid) if (typeof c.crest === 'string' && CREST_RE.test(c.crest))
      stmts.push(env.DB.prepare('UPDATE site_clubs SET crest = ?2 WHERE team_id = ?1 AND crest IS NOT ?2').bind(c.teamId, c.crest));
    if (stmts.length) await runBatch(env, stmts);
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

  // Répartition du rafraîchissement : clubs demandés depuis le site d'abord,
  // puis les clubs prioritaires de l'extension non réservés et pas trop récents.
  if (req.method === 'POST' && url.pathname === '/v1/assign') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    let limit = Math.max(0, Math.min(20, parseInt(body.limit, 10) || 0));
    const freshH = Math.max(1, Math.min(72, parseInt(body.minFreshHours, 10) || 12));
    // Extensions 2.31+ : fiches demandées joueur par joueur (une seule page lue).
    let players = [];
    if (body.players === true && limit) {
      players = (await env.DB.prepare(`SELECT r.player_id FROM player_requests r
          LEFT JOIN site_players s ON s.id = r.player_id LEFT JOIN leases l ON l.team_id = 'p:' || r.player_id
          WHERE r.requested_at > ?1 AND (s.light IS NULL OR s.light = 1) AND (l.leased_until IS NULL OR l.leased_until < ?2)
          ORDER BY r.requested_at ASC LIMIT ?3`).bind(now - REQUEST_TTL, now, limit).all()).results.map(x => x.player_id);
      if (players.length) await runBatch(env, players.map(id => env.DB.prepare(
        'INSERT INTO leases (team_id, leased_until, leased_by) VALUES (?1, ?2, ?3) ON CONFLICT(team_id) DO UPDATE SET leased_until = excluded.leased_until, leased_by = excluded.leased_by'
      ).bind('p:' + id, now + 10 * 60e3, installId || null)));
      limit -= players.length;
    }
    // Extensions récentes : les demandes de fiche passent par les joueurs ; seules
    // les demandes de club entier (« Mon effectif », player_id nul) restent.
    const asked = limit ? (await env.DB.prepare(`SELECT r.team_id FROM site_requests r
        LEFT JOIN clubs c ON c.team_id = r.team_id LEFT JOIN leases l ON l.team_id = r.team_id
        WHERE r.requested_at > ?1 AND ${body.players === true ? 'r.player_id IS NULL AND' : ''} (c.fetched_at IS NULL OR c.fetched_at < r.requested_at) AND (l.leased_until IS NULL OR l.leased_until < ?2)
        ORDER BY r.requested_at ASC LIMIT ?3`).bind(now - REQUEST_TTL, now, limit).all()).results.map(x => x.team_id) : [];
    const cands = [...new Set(asked.concat((Array.isArray(body.candidates) ? body.candidates : []).filter(x => isStr(x, 64)).slice(0, 300)))];
    if (!limit || !cands.length) return json({ assigned: [], players });
    const busy = new Set(), fresh = new Set();
    for (let i = 0; i < cands.length; i += 90) {
      const part = cands.slice(i, i + 90), ph = part.map((_, k) => '?' + (k + 2)).join(',');
      (await env.DB.prepare(`SELECT team_id FROM leases WHERE leased_until > ?1 AND team_id IN (${ph})`).bind(now, ...part).all())
        .results.forEach(r => busy.add(r.team_id));
      (await env.DB.prepare(`SELECT team_id FROM clubs WHERE fetched_at > ?1 AND team_id IN (${ph})`).bind(now - freshH * 3600e3, ...part).all())
        .results.forEach(r => fresh.add(r.team_id));
    }
    const assigned = cands.filter(id => asked.includes(id) || (!busy.has(id) && !fresh.has(id))).slice(0, limit);
    if (assigned.length) {
      await runBatch(env, assigned.map(id => env.DB.prepare(
        'INSERT INTO leases (team_id, leased_until, leased_by) VALUES (?1, ?2, ?3) ON CONFLICT(team_id) DO UPDATE SET leased_until = excluded.leased_until, leased_by = excluded.leased_by'
      ).bind(id, now + 30 * 60e3, installId || null)));
    }
    return json({ assigned, players });
  }

  // Fiches complètes lues joueur par joueur (extensions 2.31+).
  if (req.method === 'POST' && url.pathname === '/v1/players') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const items = (Array.isArray(body.players) ? body.players.slice(0, 20) : [])
      .filter(x => x && validPlayer(x.player) && isInt(x.fetchedAt, 1.6e12, now + 5 * 60e3) && JSON.stringify(x.player).length < 60000);
    const stmts = [];
    for (const { player: p, fetchedAt } of items) {
      const team = isStr(p.club_id, 64) ? p.club_id : null;
      stmts.push(env.DB.prepare(`INSERT INTO full_players (id, team_id, fetched_at, data) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET team_id = excluded.team_id, fetched_at = excluded.fetched_at, data = excluded.data
        WHERE excluded.fetched_at > full_players.fetched_at`).bind(p.id, team, fetchedAt, JSON.stringify(p)));
      stmts.push(upsertFull(env, p, team, fetchedAt));
      stmts.push(env.DB.prepare('DELETE FROM player_requests WHERE player_id = ?1').bind(p.id));
      const history = items.find(x => x.player === p).history;
      const text = history != null && typeof history === 'object' ? JSON.stringify(history) : null;
      if (text && text.length <= HISTORY_MAX) stmts.push(env.DB.prepare(`INSERT INTO player_history (player_id, fetched_at, data) VALUES (?1, ?2, ?3)
        ON CONFLICT(player_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data
        WHERE excluded.fetched_at > player_history.fetched_at AND excluded.data IS NOT player_history.data`).bind(p.id, fetchedAt, text));
    }
    if (stmts.length) await runBatch(env, stmts);
    return json({ accepted: items.length, rejected: (Array.isArray(body.players) ? Math.min(20, body.players.length) : 0) - items.length });
  }

  // Historique d'OVR seul (joueurs de ton effectif, relus une fois par jour).
  if (req.method === 'POST' && url.pathname === '/v1/history') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const raw = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
    const stmts = [];
    for (const x of raw) {
      if (!x || !isStr(x.id, 64) || !isInt(x.fetchedAt, 1.6e12, now + 5 * 60e3) || x.history == null || typeof x.history !== 'object') continue;
      const text = JSON.stringify(x.history);
      if (text.length > HISTORY_MAX) continue;
      stmts.push(env.DB.prepare(`INSERT INTO player_history (player_id, fetched_at, data) VALUES (?1, ?2, ?3)
        ON CONFLICT(player_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data
        WHERE excluded.fetched_at > player_history.fetched_at AND excluded.data IS NOT player_history.data`).bind(x.id, x.fetchedAt, text));
    }
    if (stmts.length) await runBatch(env, stmts);
    return json({ accepted: stmts.length, rejected: raw.length - stmts.length });
  }

  // Table des confrontations : envoi des duels lus dans les analyses de match.
  if (req.method === 'POST' && url.pathname === '/v1/matchups') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const raw = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    // Styles de jeu (liste fermée) ou formations (« 4-2-4 »), jamais mélangés.
    const kind = (v) => PLAYSTYLES.includes(v) ? 'style' : (typeof v === 'string' && /^\d(-\d){2,4}$/.test(v) ? 'formation' : null);
    const items = raw.filter(x => x && isStr(x.matchId, 80) && kind(x.winner) && kind(x.winner) === kind(x.loser)
      && x.winner !== x.loser && isInt(x.seenAt, 1.6e12, now + 5 * 60e3));
    if (items.length) await runBatch(env, items.map(x => env.DB.prepare(
      'INSERT OR IGNORE INTO matchups (match_id, winner, loser, seen_at, text) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(x.matchId, x.winner, x.loser, x.seenAt, typeof x.text === 'string' ? x.text.slice(0, 300) : null)));
    return json({ accepted: items.length, rejected: raw.length - items.length });
  }
  if (req.method === 'GET' && url.pathname === '/v1/matchups') {
    const { results } = await env.DB.prepare(
      'SELECT winner, loser, COUNT(*) AS n, MAX(seen_at) AS last FROM matchups GROUP BY winner, loser ORDER BY winner, loser').all();
    return json({ pairs: results.map(r => ({ winner: r.winner, loser: r.loser, n: Number(r.n), last: Number(r.last) })) });
  }

  // Liste légère (identifiant + date) pour que chaque extension sache ce
  // qui manque au serveur et le rattrape.
  if (req.method === 'GET' && url.pathname === '/v1/index') {
    const { results } = await env.DB.prepare('SELECT team_id, fetched_at FROM clubs').all();
    return json({ count: results.length, clubs: results.map(r => [r.team_id, r.fetched_at]) });
  }

  // --- Base des joueurs du jeu -----------------------------------------------
  if (req.method === 'POST' && url.pathname === '/v1/db/players') {
    let body; try { body = await req.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400); }
    const slice = parseSlice(body.a);
    const a = DB_AVAIL.includes(body.a) || slice ? body.a : null;
    const p = isInt(body.p, 1, 100000) ? body.p : null;
    const raw = Array.isArray(body.players) ? body.players.slice(0, 60) : [];
    const players = raw.filter(validDbPlayer);
    const protocol2 = body.protocol === 2;
    const assigned = protocol2 && body.taskId != null;
    const defer = reason => json({ status: 'retry_after', reason, accepted: 0, rejected: raw.length,
      pageAcknowledged: false, retryAfterMs: 300000 });
    if (protocol2) {
      if (!Array.isArray(body.players) || body.players.length > MAX_PLAYERS || body.rawCount !== body.players.length
        || players.length !== raw.length || new Set(players.map(x => x.id)).size !== players.length)
        return defer('Page incomplète, doublons ou joueurs invalides.');
      if (!isInt(body.collectedAt, now - 30 * 60000, now + 5 * 60000)) return defer('Date de lecture invalide ou trop ancienne.');
      if (assigned) {
        if (!a || !p || !isStr(body.taskId, 128) || !isInt(body.total, 0, 2000000)) return defer('Tâche ou total invalide.');
        const lease = await env.DB.prepare('SELECT leased_until, leased_by, task_id FROM db_pages WHERE a = ?1 AND p = ?2').bind(a, p).first();
        if (!lease || lease.task_id !== body.taskId || lease.leased_by !== (installId || null) || lease.leased_until <= now)
          return defer('Réservation absente, expirée ou remplacée.');
        if (body.collectedAt < lease.leased_until - DB_LEASE_MS - 60000) return defer('Lecture antérieure à la réservation.');
        const expected = Math.min(DB_PAGE_SIZE, Math.max(0, body.total - (p - 1) * DB_PAGE_SIZE));
        if (raw.length !== expected || (p > 1 && p > Math.max(1, Math.ceil(body.total / DB_PAGE_SIZE))))
          return defer('Nombre de joueurs incompatible avec la page et le total.');
        if (slice && players.some(x => x.position !== slice.pos || x.overall < slice.min || x.overall > slice.max))
          return defer('Joueur hors de la tranche confiée.');
        if ((a === 'transfer' && players.some(x => !(x.transfer_price > 0)))
          || (a === 'loan' && players.some(x => !(x.loan_fee > 0)))) return defer('Joueur hors du marché confié.');
      } else if (body.a != null || body.p != null) return defer('Une observation passive ne confirme pas une tâche.');
    }
    if (!players.length && !(a && p)) return json({ error: 'données refusées' }, 400);
    // Budget du jour atteint : on garde le marché (prix), on suspend le reste.
    const over = (await writesToday(env)) >= writeBudget(env) && a !== 'transfer' && a !== 'loan';
    if (protocol2 && over) return json({ status: 'retry_after', reason: 'Budget journalier atteint.', accepted: 0,
      rejected: 0, paused: true, pageAcknowledged: false, retryAfterMs: 3600000 });
    const stmts = [];
    if (!over) {
      const clubs = new Map();
      for (const x of players) if (!x.free_agent && isStr(x.club_id, 64) && isStr(x.club_name, 80)) clubs.set(x.club_id, x.club_name);
      for (const [id, name] of clubs) stmts.push(upsertClubName(env, id, name, now));
      for (const x of players) {
        stmts.push(upsertDbDetail(env, x, now), upsertLight(env, x));
        if (x.transfer_price > 0) stmts.push(upsertPrice(env, x, 'transfer', x.transfer_price, now));
        if (x.loan_fee > 0) stmts.push(upsertPrice(env, x, 'loan', x.loan_fee, now));
      }
    }
    const tooBig = slice && p === 1 && isInt(body.total, 0, 2000000) && body.total > DB_SLICE_SPLIT && slice.max > slice.min;
    if (tooBig) {
      // Tranche trop grosse : coupée en deux (ses joueurs sont quand même gardés).
      const mid = Math.floor((slice.min + slice.max) / 2);
      if (assigned) {
        const live = `a = ?1 AND p = 1 AND task_id = ?2 AND leased_by IS ?3
          AND leased_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;
        // The server's database clock also protects a lease that expires during the upload.
        stmts.push(env.DB.prepare(`UPDATE db_pages SET done_at = -1 WHERE ${live}`).bind(a, body.taskId, installId || null));
        for (const [lo, hi] of [[slice.min, mid], [mid + 1, slice.max]])
          stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO db_pages (a, p) SELECT ?4, 1 FROM db_pages WHERE ${live} AND done_at = -1`)
            .bind(a, body.taskId, installId || null, sliceKey(slice.pos, lo, hi)));
        stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO db_split_receipts (task_id, a, completed_at)
          SELECT ?2, a, ?4 FROM db_pages WHERE ${live} AND done_at = -1`).bind(a, body.taskId, installId || null, now));
        stmts.push(env.DB.prepare(`DELETE FROM db_meta WHERE k = ?4 AND EXISTS (SELECT 1 FROM db_pages WHERE ${live} AND done_at = -1)`)
          .bind(a, body.taskId, installId || null, 'total:' + a));
        stmts.push(env.DB.prepare(`DELETE FROM db_page_audits WHERE a = ?1 AND EXISTS (SELECT 1 FROM db_pages WHERE ${live} AND done_at = -1)`)
          .bind(a, body.taskId, installId || null));
        stmts.push(env.DB.prepare(`DELETE FROM db_pages WHERE ${live} AND done_at = -1`).bind(a, body.taskId, installId || null));
      } else {
        stmts.push(env.DB.prepare('DELETE FROM db_pages WHERE a = ?1').bind(a), env.DB.prepare('DELETE FROM db_meta WHERE k = ?1').bind('total:' + a),
          env.DB.prepare('DELETE FROM db_page_audits WHERE a = ?1').bind(a));
        for (const [lo, hi] of [[slice.min, mid], [mid + 1, slice.max]])
          stmts.push(env.DB.prepare('INSERT OR IGNORE INTO db_pages (a, p) VALUES (?1, 1)').bind(sliceKey(slice.pos, lo, hi)));
      }
    } else if (a && p) {
      if (assigned) {
        stmts.push(env.DB.prepare(`UPDATE db_pages SET done_at = ?3, leased_until = 0
          WHERE a = ?1 AND p = ?2 AND task_id = ?4 AND leased_by IS ?5
            AND leased_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`).bind(a, p, now, body.taskId, installId || null));
        stmts.push(env.DB.prepare(`INSERT INTO db_page_audits (a, p, task_id, confirmed_at, collected_at, total, raw_count, ids)
          SELECT a, p, ?4, ?3, ?6, ?7, ?8, ?9 FROM db_pages
          WHERE a = ?1 AND p = ?2 AND task_id = ?4 AND leased_by IS ?5 AND done_at = ?3 AND leased_until = 0
          ON CONFLICT(a, p) DO UPDATE SET task_id = excluded.task_id, confirmed_at = excluded.confirmed_at,
            collected_at = excluded.collected_at, total = excluded.total, raw_count = excluded.raw_count, ids = excluded.ids`)
          .bind(a, p, now, body.taskId, installId || null, body.collectedAt, body.total, raw.length, JSON.stringify(players.map(x => x.id))));
      } else {
        stmts.push(env.DB.prepare('INSERT INTO db_pages (a, p, done_at) VALUES (?1, ?2, ?3) ON CONFLICT(a, p) DO UPDATE SET done_at = excluded.done_at, leased_until = 0').bind(a, p, now));
      }
      if (isInt(body.total, 0, 2000000) && a !== 'free') {
        const pages = Math.max(1, Math.ceil(body.total / DB_PAGE_SIZE));
        const prev = await env.DB.prepare('SELECT v FROM db_meta WHERE k = ?1').bind('total:' + a).first();
        if (!prev || Math.ceil(+prev.v / DB_PAGE_SIZE) !== pages) {
          stmts.push(env.DB.prepare(`WITH RECURSIVE s(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM s WHERE x < ?2)
            INSERT OR IGNORE INTO db_pages (a, p) SELECT ?1, x FROM s`).bind(a, pages));
          stmts.push(env.DB.prepare('DELETE FROM db_pages WHERE a = ?1 AND p > ?2').bind(a, pages));
          stmts.push(env.DB.prepare('DELETE FROM db_page_audits WHERE a = ?1 AND p > ?2').bind(a, pages));
        }
        if (!prev || +prev.v !== body.total)
          stmts.push(env.DB.prepare('INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('total:' + a, String(body.total)));
      }
    }
    await runBatch(env, stmts);
    statsCacheByDb.delete(env.DB);
    if (protocol2) {
      if (assigned && tooBig) {
        const receipt = await env.DB.prepare('SELECT task_id FROM db_split_receipts WHERE task_id = ?1').bind(body.taskId).first();
        const parent = await env.DB.prepare('SELECT a FROM db_pages WHERE a = ?1').bind(a).first();
        if (!receipt || parent) return defer('Réservation remplacée pendant la subdivision.');
      }
      if (assigned && !tooBig) {
        const proof = await env.DB.prepare('SELECT task_id FROM db_page_audits WHERE a = ?1 AND p = ?2').bind(a, p).first();
        if (proof?.task_id !== body.taskId) return defer('Réservation remplacée pendant l’envoi.');
      }
      return json({ status: tooBig ? 'split' : 'completed', accepted: players.length, rejected: 0,
        pageAcknowledged: assigned && !tooBig });
    }
    return json({ accepted: over ? 0 : players.length, rejected: raw.length - players.length, paused: over || undefined });
  }

  // Pages confiées : marché et prêts d'abord (toutes les heures), puis la
  // base complète (un tour par jour), sauf si le budget d'écritures est atteint.
  if (req.method === 'POST' && url.pathname === '/v1/db/assign') {
    let body; try { body = await req.json(); } catch (_) { body = {}; }
    const limit = Math.max(1, Math.min(30, parseInt(body.limit, 10) || 10));
    const market = await env.DB.prepare(`SELECT a, p FROM db_pages WHERE a IN ('transfer', 'loan') AND done_at < ?1 AND leased_until < ?2
      ORDER BY done_at ASC, p ASC LIMIT ?3`).bind(now - DB_MARKET_MS, now, limit).all();
    let tasks = market.results.map(r => ({ a: r.a, p: r.p, kind: 'market' }));
    const budgetOk = (await writesToday(env)) < writeBudget(env);
    if (tasks.length < limit && body.full !== false && budgetOk) {
      const full = await env.DB.prepare(`SELECT a, p FROM db_pages WHERE a LIKE 's:%' AND done_at < ?1 AND leased_until < ?2
        ORDER BY done_at ASC, a ASC, p ASC LIMIT ?3`).bind(now - DB_FULL_MS, now, limit - tasks.length).all();
      tasks = tasks.concat(full.results.map(r => ({ a: r.a, p: r.p, kind: 'full' })));
    }
    if (tasks.length) {
      tasks = tasks.map(t => ({ ...t, taskId: crypto.randomUUID(), leasedUntil: now + DB_LEASE_MS }));
      await runBatch(env, tasks.map(t => env.DB.prepare(`UPDATE db_pages SET leased_until = ?3, leased_by = ?4, task_id = ?5
        WHERE a = ?1 AND p = ?2 AND leased_until < ?6`).bind(t.a, t.p, t.leasedUntil, installId || null, t.taskId, now)));
      const tokens = tasks.map(t => t.taskId), placeholders = tokens.map((_, i) => `?${i + 1}`).join(',');
      const won = await env.DB.prepare(`SELECT task_id FROM db_pages WHERE task_id IN (${placeholders})`).bind(...tokens).all();
      const ids = new Set(won.results.map(x => x.task_id));
      tasks = tasks.filter(t => ids.has(t.taskId));
    }
    return json({ protocol: 2, tasks, budget: budgetOk ? undefined : 'atteint' });
  }

  // Recherche dans la base (extension) : mêmes requêtes indexées que le site.
  if (req.method === 'GET' && url.pathname === '/v1/db/search') {
    const params = Object.fromEntries(url.searchParams);
    const SORT_ALIAS = { overall: 'overall', potential: 'potential', gap: 'gap', price: 'price', loan: 'loan' };
    const c = await catalog(env, { ...params, sort: SORT_ALIAS[params.sort] || 'overall', page: String((parseInt(params.page || '0', 10) || 0) + 1) }, 50);
    const ids = c.results.map(r => r.id);
    const details = new Map();
    if (ids.length) {
      const ph = ids.map((_, i) => '?' + (i + 1)).join(',');
      (await env.DB.prepare(`SELECT id, value, nationality, flag_code, traits, attrs, portrait_url, seen_at, club_id FROM db_players WHERE id IN (${ph})`)
        .bind(...ids).all()).results.forEach(d => details.set(d.id, d));
    }
    return json({ total: c.total, capped: c.capped, page: c.page - 1, players: c.results.map(r => {
      const d = details.get(r.id) || {};
      let traits = [], attrs = {};
      try { traits = JSON.parse(d.traits || '[]'); } catch (_) {}
      try { attrs = JSON.parse(d.attrs || '{}'); } catch (_) {}
      return { id: r.id, name: r.name, position: r.position, age: r.age, overall: r.overall, potential: r.potential, value: d.value ?? null,
        club_id: r.team_id || d.club_id || null, club_name: r.club_name, nationality: d.nationality ?? null, flag_code: d.flag_code ?? null,
        free_agent: !!r.free_agent, transfer_price: r.transfer_price, loan_fee: r.loan_fee, traits, attrs, portrait_url: d.portrait_url ?? null,
        seen_at: d.seen_at || r.src_at || 0, light: !!r.light };
    }) });
  }

  // Historique des prix demandés d'un joueur.
  if (req.method === 'GET' && url.pathname === '/v1/db/prices') {
    const id = url.searchParams.get('id');
    if (!isStr(id, 64)) return json({ error: 'id manquant' }, 400);
    const { results } = await env.DB.prepare('SELECT kind, price, overall, potential, age, first_seen, last_seen FROM db_prices WHERE player_id = ?1 ORDER BY first_seen').bind(id).all();
    return json({ prices: results });
  }

  // Statistiques : calculées au plus toutes les 10 minutes (requêtes indexées).
  if (req.method === 'GET' && url.pathname === '/v1/db/stats') {
    const cached = statsCacheByDb.get(env.DB);
    if (cached && cached.data.protocol === 2 && now - cached.at < STATS_TTL) return json(cached.data);
    const saved = await env.DB.prepare('SELECT v FROM db_meta WHERE k = ?1').bind('stats').first();
    if (saved) { const s = JSON.parse(saved.v); if (s.data.protocol === 2 && now - s.at < STATS_TTL) { statsCacheByDb.set(env.DB, s); return json(s.data); } }
    const players = (await env.DB.prepare('SELECT MAX(rowid) AS n FROM site_players').first())?.n || 0;
    const transfer = (await env.DB.prepare('SELECT COUNT(*) AS n FROM site_players WHERE transfer_price > 0').first()).n;
    const loan = (await env.DB.prepare('SELECT COUNT(*) AS n FROM site_players WHERE loan_fee > 0').first()).n;
    const pg = await env.DB.prepare(`SELECT CASE WHEN d.a LIKE 's:%' THEN 'all' ELSE d.a END AS a, COUNT(*) AS pages,
      SUM(c.confirmed_at = d.done_at AND c.confirmed_at > ?1) AS fresh,
      MAX(CASE WHEN c.confirmed_at = d.done_at THEN c.confirmed_at ELSE 0 END) AS last, COUNT(DISTINCT d.a) AS slices
      FROM db_pages d LEFT JOIN db_page_audits c ON c.a = d.a AND c.p = d.p GROUP BY 1`).bind(now - DB_FULL_MS).all();
    const meta = await env.DB.prepare("SELECT k, v FROM db_meta WHERE k LIKE 'total:%'").all();
    const totals = {};
    for (const r of meta.results) {
      const k = r.k.slice(6);
      if (k.startsWith('s:')) totals.all = (totals.all || 0) + (+r.v); else totals[k] = +r.v;
    }
    const audit = await env.DB.prepare(`SELECT d.a, d.p, d.done_at, c.confirmed_at, c.ids FROM db_pages d
      LEFT JOIN db_page_audits c ON c.a = d.a AND c.p = d.p WHERE d.a LIKE 's:%'`).all();
    const coverageGroups = new Map();
    for (const row of audit.results) {
      let group = coverageGroups.get(row.a);
      if (!group) {
        const total = meta.results.find(r => r.k === 'total:' + row.a);
        group = { a: row.a, expectedPages: total ? Math.max(1, Math.ceil(+total.v / DB_PAGE_SIZE)) : null,
          confirmedPages: 0, missingPages: 0, stalePages: 0, failedPages: 0, rejectedPlayers: 0, ids: new Set() };
        coverageGroups.set(row.a, group);
      }
      if (!row.confirmed_at || row.confirmed_at !== row.done_at) group.missingPages++;
      else if (row.confirmed_at <= now - DB_FULL_MS) group.stalePages++;
      else {
        group.confirmedPages++;
        try { for (const id of JSON.parse(row.ids)) group.ids.add(id); } catch (_) {}
      }
    }
    const coverage = { globallyVerified: false, slices: [...coverageGroups.values()].map(({ ids, ...group }) => ({ ...group, uniqueIds: ids.size })), failures: [] };
    const data = { protocol: 2, players, transfer, loan, free: totals.free ?? null, pages: pg.results, totals, coverage,
      writesToday: await writesToday(env), writeBudget: Number.isFinite(writeBudget(env)) ? writeBudget(env) : null };
    const entry = { at: now, data };
    statsCacheByDb.set(env.DB, entry);
    await env.DB.prepare('INSERT INTO db_meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('stats', JSON.stringify(entry)).run();
    return json(data);
  }

  if (req.method === 'GET' && url.pathname === '/v1/stats') {
    const r = await env.DB.prepare('SELECT COUNT(*) AS clubs, MAX(updated_at) AS last FROM clubs').first();
    return json(r);
  }
  return json({ error: 'introuvable' }, 404);
}
