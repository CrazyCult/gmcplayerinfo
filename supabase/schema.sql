-- GMC Companion + GameChase Player Info : base Supabase (PostgreSQL).
-- À coller UNE fois dans Supabase → SQL Editor → Run. Le script peut être
-- relancé sans risque (tout est « if not exists » / « create or replace »).
-- Le Worker Cloudflare appelle uniquement les fonctions gmc_* ci-dessous, avec
-- la clé secrète du projet : aucune table n'est lisible avec la clé publique.
-- Horodatages en millisecondes (comme Date.now()).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists clubs (
  team_id text primary key,
  fetched_at bigint not null,
  updated_at bigint not null,
  contributor text,
  players jsonb not null
);
create index if not exists clubs_updated on clubs (updated_at);

create table if not exists leases (
  team_id text primary key,
  leased_until bigint not null,
  leased_by text
);

-- Catalogue : une ligne par joueur. light = fiche légère (base du jeu seule).
create table if not exists site_players (
  id text primary key,
  team_id text,
  light boolean not null,
  src_at bigint not null default 0,
  name text not null,
  name_norm text collate "C" not null,
  last_norm text collate "C" not null,
  position text,
  age int,
  overall int,
  potential int,
  transfer_price bigint,
  loan_fee bigint,
  free_agent boolean not null default false,
  club_name text
);
create index if not exists sp_ovr on site_players (overall desc);
create index if not exists sp_pos on site_players (position, overall desc);
create index if not exists sp_name on site_players (name_norm);
create index if not exists sp_last on site_players (last_norm);
create index if not exists sp_tp on site_players (transfer_price) where transfer_price > 0;
create index if not exists sp_lf on site_players (loan_fee) where loan_fee > 0;

-- Base du jeu : détail des fiches légères.
create table if not exists db_players (
  id text primary key,
  name text not null,
  position text,
  age int,
  overall int,
  potential int,
  value bigint,
  club_id text,
  club_name text,
  nationality text,
  flag_code text,
  free_agent boolean not null default false,
  transfer_price bigint,
  loan_fee bigint,
  traits jsonb not null default '[]',
  attrs jsonb not null default '{}',
  portrait_url text,
  seen_at bigint not null
);

-- Prix demandés relevés (vente / prêt).
create table if not exists db_prices (
  player_id text not null,
  kind text not null,
  price bigint not null,
  overall int,
  potential int,
  age int,
  position text,
  first_seen bigint not null,
  last_seen bigint not null,
  primary key (player_id, kind, price)
);
create index if not exists db_prices_cmp on db_prices (position, overall);

-- Pages de la base du jeu confiées aux extensions.
create table if not exists db_pages (
  a text not null,
  p int not null,
  done_at bigint not null default 0,
  leased_until bigint not null default 0,
  leased_by text,
  primary key (a, p)
);
create index if not exists db_pages_due on db_pages (a, done_at);
insert into db_pages (a, p) values ('all', 1), ('transfer', 1), ('loan', 1) on conflict do nothing;

create table if not exists db_meta (k text primary key, v text);

-- Demandes du site : « lire ce club en priorité ».
create table if not exists site_requests (
  team_id text primary key,
  player_id text,
  requested_at bigint not null
);

-- ---------------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------------
create or replace function gmc_norm(t text) returns text
language sql immutable as $$
  select btrim(translate(lower(coalesce(t, '')),
    'àáâãäåāăąçćčďèéêëēĕėęěìíîïĩīĭįłñńňòóôõöøōŏőŕřśšşťùúûüũūŭůűųýÿžźż',
    'aaaaaaaaacccdeeeeeeeeeiiiiiiiilnnnoooooooooorrsssstuuuuuuuuuuyyzzz'))
$$;
create or replace function gmc_last(t text) returns text
language sql immutable as $$ select regexp_replace(gmc_norm(t), '^.*\s', '') $$;
create or replace function gmc_int(v jsonb) returns int
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then round((v #>> '{}')::numeric)::int end
$$;
create or replace function gmc_big(v jsonb) returns bigint
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric > 0 then round((v #>> '{}')::numeric)::bigint end
$$;

-- Joueurs d'un effectif complet → catalogue (réécrit seulement ce qui change).
create or replace function gmc_upsert_full(p_players jsonb, p_team text, p_src bigint) returns void
language sql as $$
  insert into site_players as s (id, team_id, light, src_at, name, name_norm, last_norm, position, age, overall, potential)
  select distinct on (x->>'id') x->>'id', p_team, false, p_src, x->>'name', gmc_norm(x->>'name'), gmc_last(x->>'name'),
    x->>'position', gmc_int(x->'age'), gmc_int(x->'overall'), gmc_int(x->'potential')
  from jsonb_array_elements(p_players) x
  where x->>'id' is not null and x->>'name' is not null
  on conflict (id) do update set team_id = excluded.team_id, light = false, src_at = excluded.src_at,
    name = excluded.name, name_norm = excluded.name_norm, last_norm = excluded.last_norm, position = excluded.position,
    age = excluded.age, overall = excluded.overall, potential = excluded.potential
  where s.light or (excluded.src_at >= s.src_at and (s.team_id is distinct from excluded.team_id
    or s.name is distinct from excluded.name or s.position is distinct from excluded.position
    or s.age is distinct from excluded.age or s.overall is distinct from excluded.overall
    or s.potential is distinct from excluded.potential));
$$;

-- ---------------------------------------------------------------------------
-- Extension : effectifs partagés
-- ---------------------------------------------------------------------------
create or replace function gmc_post_clubs(p_clubs jsonb, p_contributor text, p_now bigint) returns jsonb
language plpgsql as $$
declare c jsonb; stored int := 0;
begin
  for c in select * from jsonb_array_elements(p_clubs) loop
    insert into clubs as t (team_id, fetched_at, updated_at, contributor, players)
    values (c->>'teamId', (c->>'fetchedAt')::bigint, p_now, p_contributor, c->'players')
    on conflict (team_id) do update set fetched_at = excluded.fetched_at, updated_at = excluded.updated_at,
      contributor = excluded.contributor, players = excluded.players
    where excluded.fetched_at > t.fetched_at;
    if found then
      perform gmc_upsert_full(c->'players', c->>'teamId', (c->>'fetchedAt')::bigint);
      stored := stored + 1;
    end if;
  end loop;
  return jsonb_build_object('stored', stored);
end $$;

create or replace function gmc_clubs_since(p_since bigint, p_limit int) returns jsonb
language sql stable as $$
  with c as (select * from clubs where updated_at > p_since order by updated_at limit p_limit)
  select jsonb_build_object(
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('teamId', team_id, 'fetchedAt', fetched_at, 'players', players) order by updated_at) from c), '[]'::jsonb),
    'next', coalesce((select max(updated_at) from c), p_since),
    'more', (select count(*) from c) = p_limit)
$$;

create or replace function gmc_index() returns jsonb
language sql stable as $$
  select jsonb_build_object('count', count(*), 'clubs', coalesce(jsonb_agg(jsonb_build_array(team_id, fetched_at)), '[]'::jsonb)) from clubs
$$;

-- Clubs demandés depuis le site d'abord, puis candidats de l'extension non
-- réservés et pas trop récents. Réserve 30 min.
create or replace function gmc_assign(p_limit int, p_fresh_h int, p_cands text[], p_by text, p_now bigint) returns jsonb
language plpgsql as $$
declare asked text[]; picked text[];
begin
  select coalesce(array_agg(team_id order by requested_at), '{}') into asked from (
    select r.team_id, r.requested_at from site_requests r
      left join clubs c on c.team_id = r.team_id left join leases l on l.team_id = r.team_id
    where r.requested_at > p_now - 86400000 and (c.fetched_at is null or c.fetched_at < r.requested_at)
      and (l.leased_until is null or l.leased_until < p_now)
    order by r.requested_at limit p_limit) a;
  select coalesce(array_agg(id order by ord), '{}') into picked from (
    select id, min(ord) as ord from (
      select x as id, i as ord from unnest(asked) with ordinality as u(x, i)
      union all
      select x, 1000 + i from unnest(coalesce(p_cands, '{}')) with ordinality as u(x, i)
        where not exists (select 1 from leases l where l.team_id = x and l.leased_until > p_now)
          and not exists (select 1 from clubs c where c.team_id = x and c.fetched_at > p_now - p_fresh_h * 3600000::bigint)
    ) z group by id order by min(ord) limit p_limit) y;
  insert into leases (team_id, leased_until, leased_by) select unnest(picked), p_now + 1800000, p_by
  on conflict (team_id) do update set leased_until = excluded.leased_until, leased_by = excluded.leased_by;
  return to_jsonb(picked);
end $$;

create or replace function gmc_stats() returns jsonb
language sql stable as $$ select jsonb_build_object('clubs', count(*), 'last', max(updated_at)) from clubs $$;

-- ---------------------------------------------------------------------------
-- Extension : base des joueurs du jeu
-- ---------------------------------------------------------------------------
create or replace function gmc_db_players(p_a text, p_p int, p_total int, p_players jsonb, p_now bigint) returns jsonb
language plpgsql as $$
declare n int; pages int;
begin
  create temp table if not exists _in (x jsonb) on commit drop;
  delete from _in;
  insert into _in select distinct on (x->>'id') x from jsonb_array_elements(coalesce(p_players, '[]')) x where x->>'id' is not null;
  get diagnostics n = row_count;

  insert into db_players as d (id, name, position, age, overall, potential, value, club_id, club_name, nationality, flag_code,
    free_agent, transfer_price, loan_fee, traits, attrs, portrait_url, seen_at)
  select x->>'id', x->>'name', x->>'position', gmc_int(x->'age'), gmc_int(x->'overall'), gmc_int(x->'potential'),
    gmc_big(x->'value'), x->>'club_id', x->>'club_name', x->>'nationality', x->>'flag_code',
    coalesce((x->>'free_agent')::boolean, false), gmc_big(x->'transfer_price'), gmc_big(x->'loan_fee'),
    coalesce(x->'traits', '[]'), coalesce(x->'attributes', '{}'), x->>'portrait_url', p_now
  from _in
  on conflict (id) do update set name = excluded.name, position = excluded.position, age = excluded.age,
    overall = excluded.overall, potential = excluded.potential, value = excluded.value, club_id = excluded.club_id,
    club_name = excluded.club_name, nationality = excluded.nationality, flag_code = excluded.flag_code,
    free_agent = excluded.free_agent, transfer_price = excluded.transfer_price, loan_fee = excluded.loan_fee,
    traits = excluded.traits, attrs = excluded.attrs, portrait_url = excluded.portrait_url, seen_at = excluded.seen_at
  where (d.overall, d.potential, d.age, d.value, d.club_id, d.free_agent, d.transfer_price, d.loan_fee, d.position)
      is distinct from (excluded.overall, excluded.potential, excluded.age, excluded.value, excluded.club_id,
        excluded.free_agent, excluded.transfer_price, excluded.loan_fee, excluded.position)
    or d.attrs is distinct from excluded.attrs or d.traits is distinct from excluded.traits;

  insert into site_players as s (id, team_id, light, name, name_norm, last_norm, position, age, overall, potential,
    transfer_price, loan_fee, free_agent, club_name)
  select x->>'id', case when coalesce((x->>'free_agent')::boolean, false) then null else x->>'club_id' end, true,
    x->>'name', gmc_norm(x->>'name'), gmc_last(x->>'name'), x->>'position', gmc_int(x->'age'), gmc_int(x->'overall'),
    gmc_int(x->'potential'), gmc_big(x->'transfer_price'), gmc_big(x->'loan_fee'),
    coalesce((x->>'free_agent')::boolean, false), x->>'club_name'
  from _in
  on conflict (id) do update set
    team_id = case when s.light then excluded.team_id else s.team_id end,
    name = case when s.light then excluded.name else s.name end,
    name_norm = case when s.light then excluded.name_norm else s.name_norm end,
    last_norm = case when s.light then excluded.last_norm else s.last_norm end,
    position = case when s.light then excluded.position else s.position end,
    age = case when s.light then excluded.age else s.age end,
    overall = case when s.light then excluded.overall else s.overall end,
    potential = case when s.light then excluded.potential else s.potential end,
    transfer_price = excluded.transfer_price, loan_fee = excluded.loan_fee,
    free_agent = excluded.free_agent, club_name = excluded.club_name
  where (s.transfer_price, s.loan_fee, s.free_agent, s.club_name)
      is distinct from (excluded.transfer_price, excluded.loan_fee, excluded.free_agent, excluded.club_name)
    or (s.light and (s.team_id, s.name, s.position, s.age, s.overall, s.potential)
      is distinct from (excluded.team_id, excluded.name, excluded.position, excluded.age, excluded.overall, excluded.potential));

  -- Prix demandés : last_seen rafraîchi au plus toutes les 6 h.
  insert into db_prices as pr (player_id, kind, price, overall, potential, age, position, first_seen, last_seen)
  select x->>'id', k.kind, k.price, gmc_int(x->'overall'), gmc_int(x->'potential'), gmc_int(x->'age'), x->>'position', p_now, p_now
  from _in, lateral (values ('transfer', gmc_big(x->'transfer_price')), ('loan', gmc_big(x->'loan_fee'))) as k(kind, price)
  where k.price is not null
  on conflict (player_id, kind, price) do update set last_seen = excluded.last_seen
  where excluded.last_seen > pr.last_seen + 21600000;

  if p_a is not null and p_p is not null then
    insert into db_pages (a, p, done_at) values (p_a, p_p, p_now)
    on conflict (a, p) do update set done_at = excluded.done_at, leased_until = 0;
    if p_total is not null and p_a <> 'free' then
      pages := greatest(1, ceil(p_total / 24.0)::int);
      insert into db_pages (a, p) select p_a, g from generate_series(1, pages) g on conflict do nothing;
      delete from db_pages where a = p_a and p > pages;
      insert into db_meta (k, v) values ('total:' || p_a, p_total::text) on conflict (k) do update set v = excluded.v;
    end if;
  end if;
  return jsonb_build_object('accepted', n);
end $$;

create or replace function gmc_db_assign(p_limit int, p_full boolean, p_by text, p_now bigint) returns jsonb
language plpgsql as $$
declare tasks jsonb;
begin
  with picked as (
    (select a, p, 'market' as kind, 0 as pri, done_at from db_pages
      where a in ('transfer', 'loan') and done_at < p_now - 3300000 and leased_until < p_now
      order by done_at, p limit p_limit)
    union all
    (select a, p, 'full', 1, done_at from db_pages
      where p_full and a = 'all' and done_at < p_now - 86400000 and leased_until < p_now
      order by done_at, p limit p_limit)
  ), chosen as (select * from picked order by pri, done_at, p limit p_limit),
  upd as (update db_pages d set leased_until = p_now + 600000, leased_by = p_by
    from chosen c where d.a = c.a and d.p = c.p returning d.a)
  select coalesce(jsonb_agg(jsonb_build_object('a', a, 'p', p, 'kind', kind) order by pri, done_at, p), '[]'::jsonb)
  into tasks from chosen;
  return tasks;
end $$;

create or replace function gmc_db_prices(p_id text) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by first_seen), '[]'::jsonb) from (
    select kind, price, overall, potential, age, first_seen, last_seen from db_prices where player_id = p_id) r
$$;

create or replace function gmc_db_stats(p_now bigint) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'players', (select count(*) from site_players),
    'transfer', (select count(*) from site_players where transfer_price > 0),
    'loan', (select count(*) from site_players where loan_fee > 0),
    'free', (select count(*) from site_players where free_agent),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('a', a, 'pages', n, 'fresh', f, 'last', l)), '[]'::jsonb) from (
      select a, count(*) n, count(*) filter (where done_at > p_now - 86400000) f, max(done_at) l from db_pages group by a) g),
    'totals', (select coalesce(jsonb_object_agg(substr(k, 7), v::bigint), '{}'::jsonb) from db_meta where k like 'total:%'))
$$;

-- ---------------------------------------------------------------------------
-- Catalogue (site et extension)
-- ---------------------------------------------------------------------------
create or replace function gmc_catalog(p jsonb, p_limit int, p_details boolean default false) returns jsonb
language plpgsql stable as $$
declare
  q text := nullif(gmc_norm(p->>'q'), '');
  raw text := nullif(btrim(p->>'q'), '');
  pos text := nullif(p->>'position', '');
  avail text := coalesce(p->>'avail', '');
  sort text := coalesce(nullif(p->>'sort', ''), 'overall');
  page int := greatest(1, least(1000, coalesce((p->>'page')::int, 1)));
  result jsonb;
begin
  if length(q) < 2 then q := null; end if;
  with f as materialized (
    select s.* from site_players s
    where (q is null or starts_with(s.name_norm, q) or starts_with(s.last_norm, q) or s.id = raw)
      and (pos is null or s.position = pos)
      and ((p->>'ageMin') is null or s.age >= (p->>'ageMin')::int) and ((p->>'ageMax') is null or s.age <= (p->>'ageMax')::int)
      and ((p->>'ovrMin') is null or s.overall >= (p->>'ovrMin')::int) and ((p->>'ovrMax') is null or s.overall <= (p->>'ovrMax')::int)
      and ((p->>'potMin') is null or s.potential >= (p->>'potMin')::int) and ((p->>'potMax') is null or s.potential <= (p->>'potMax')::int)
      and ((p->>'gapMin') is null or s.potential - s.overall >= (p->>'gapMin')::int)
      and ((p->>'priceMax') is null or s.transfer_price <= (p->>'priceMax')::bigint)
      and (not (avail = 'transfer' or sort = 'price') or s.transfer_price > 0)
      and (not (avail = 'loan' or sort = 'loan') or s.loan_fee > 0)
      and (avail <> 'free' or s.free_agent)
      and (avail <> 'full' or not s.light)
  ), pg as (
    select c.* from f c
    order by
      case when sort = 'overall' then c.overall end desc nulls last,
      case when sort = 'potential' then c.potential end desc nulls last,
      case when sort = 'gap' then c.potential - c.overall end desc nulls last,
      case when sort = 'price' then c.transfer_price end asc nulls last,
      case when sort = 'loan' then c.loan_fee end asc nulls last,
      case when sort = 'age' then c.age end asc nulls last,
      c.overall desc nulls last, c.id
    limit p_limit offset (page - 1) * p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'page', page,
    'pages', ceil((select count(*) from f)::numeric / p_limit)::int,
    'rows', coalesce((select jsonb_agg(to_jsonb(c) || case when p_details then coalesce((select jsonb_build_object(
        'value', d.value, 'nationality', d.nationality, 'flag_code', d.flag_code, 'traits', d.traits, 'attrs', d.attrs,
        'portrait_url', d.portrait_url, 'seen_at', d.seen_at, 'club_id', d.club_id) from db_players d where d.id = c.id), '{}'::jsonb)
      else '{}'::jsonb end) from pg c), '[]'::jsonb))
  into result;
  return result;
end $$;

-- Fiche : ligne du catalogue, joueur dans son club, détail de la base, prix.
create or replace function gmc_player(p_id text, p_now bigint) returns jsonb
language plpgsql stable as $$
declare s site_players; c clubs; d db_players; raw jsonb; me_pos text; me_ovr int; me_age int;
begin
  select * into s from site_players where id = p_id;
  if found and not s.light and s.team_id is not null then
    select * into c from clubs where team_id = s.team_id;
    if found then
      select x into raw from jsonb_array_elements(c.players) x where x->>'id' = p_id limit 1;
    end if;
  end if;
  select * into d from db_players where id = p_id;
  if raw is null and d.id is null then return null; end if;
  me_pos := coalesce(raw->>'position', d.position);
  me_ovr := coalesce(gmc_int(raw->'overall'), d.overall);
  me_age := coalesce(gmc_int(raw->'age'), d.age);
  return jsonb_build_object(
    'site', case when s.id is null then null else to_jsonb(s) end,
    'raw', raw,
    'fetchedAt', case when raw is not null then c.fetched_at else d.seen_at end,
    'db', case when d.id is null then null else to_jsonb(d) end,
    'prices', (select coalesce(jsonb_agg(to_jsonb(r) order by first_seen desc), '[]'::jsonb) from (
      select kind, price, overall, potential, age, first_seen, last_seen from db_prices where player_id = p_id
      order by first_seen desc limit 50) r),
    'comparables', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select kind, price, overall, potential, age, last_seen from db_prices
      where position = me_pos and overall between me_ovr - 2 and me_ovr + 2 and age between me_age - 2 and me_age + 2
        and last_seen > p_now - 2592000000 and player_id <> p_id
      order by last_seen desc limit 300) r));
end $$;

-- Demande de fiche complète (seule écriture permise au site) et état.
create or replace function gmc_site_request(p_id text, p_write boolean, p_now bigint) returns jsonb
language plpgsql as $$
declare s site_players; c_at bigint; r_at bigint; pending boolean; n int;
begin
  select * into s from site_players where id = p_id;
  if not found then return jsonb_build_object('error', 'introuvable'); end if;
  if not s.light then select fetched_at into c_at from clubs where team_id = s.team_id; end if;
  select requested_at into r_at from site_requests where team_id = s.team_id;
  pending := r_at is not null and p_now - r_at < 86400000 and s.light;
  if not p_write then
    return jsonb_build_object('light', s.light, 'fetchedAt', c_at, 'requestedAt', case when pending then r_at end);
  end if;
  if not s.light then return jsonb_build_object('light', false, 'status', 'complet'); end if;
  if s.team_id is null or s.free_agent then return jsonb_build_object('error', 'agent-libre'); end if;
  if pending then return jsonb_build_object('light', true, 'status', 'deja-demande', 'requestedAt', r_at); end if;
  select count(*) into n from site_requests where requested_at > p_now - 86400000;
  if n >= 300 then return jsonb_build_object('error', 'file-pleine'); end if;
  insert into site_requests (team_id, player_id, requested_at) values (s.team_id, p_id, p_now)
  on conflict (team_id) do update set player_id = excluded.player_id, requested_at = excluded.requested_at;
  return jsonb_build_object('light', true, 'status', 'demande', 'requestedAt', p_now);
end $$;

-- Migration depuis D1 : marque d'avancement.
create or replace function gmc_meta_get(p_k text) returns text language sql stable as $$ select v from db_meta where k = p_k $$;
create or replace function gmc_meta_set(p_k text, p_v text) returns void language sql as $$
  insert into db_meta (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;

-- ---------------------------------------------------------------------------
-- Sécurité : tables invisibles via l'API publique, fonctions réservées à la
-- clé secrète (service_role). Ignoré hors Supabase (rôles absents).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clubs', 'leases', 'site_players', 'db_players', 'db_prices', 'db_pages', 'db_meta', 'site_requests'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke execute on all functions in schema public from public, anon, authenticated';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end $$;
