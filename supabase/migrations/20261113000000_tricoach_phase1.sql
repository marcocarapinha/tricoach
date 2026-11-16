-- TriCoach · Fase 1 · esquema base
-- Todas as tabelas têm RLS por user_id. A chave Garmin fica no Supabase Vault e só é lida pela Edge Function (service role).

create extension if not exists pgcrypto;
create extension if not exists supabase_vault;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ───────────── Perfil do atleta ─────────────
create table public.athlete_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Atleta',
  ftp int not null default 250,
  run_threshold_pace int not null default 270,  -- s/km
  css int not null default 100,                  -- s/100 m
  hr_max int not null default 185,
  lthr int not null default 165,
  weight numeric(5,1) not null default 70,
  sleep_target_h numeric(3,1) not null default 8,
  season_start_month int not null default 10 check (season_start_month between 1 and 12),
  readiness_weights jsonb not null default '{"hrv":30,"sleep":25,"tsb":20,"rhr":15,"energy":10}',
  next_race jsonb,                               -- {"date":"2027-06-22","name":"…","priority":"A"}
  updated_at timestamptz not null default now()
);

-- ───────────── Ligação Garmin ─────────────
create table public.garmin_connection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'not_connected' check (status in ('not_connected','connected','error','expired')),
  key_expires_at date,
  access_token_expires_at timestamptz,
  last_sync_at timestamptz,
  backfill_from date,
  backfill_cursor date,              -- próximo dia a importar (vai recuando até backfill_from)
  backfill_done boolean not null default false,
  last_error text,
  updated_at timestamptz not null default now()
);

-- ───────────── Atividades ─────────────
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  garmin_id text not null,
  start_time timestamptz not null,
  activity_date date not null,
  sport text not null check (sport in ('swim','bike','run','brick','strength','other')),
  sub_sport text not null default 'generic',
  name text not null default '',
  duration_s int not null default 0,
  distance_m numeric not null default 0,
  elevation_m numeric not null default 0,
  avg_hr int, max_hr int,
  avg_power int, norm_power int,
  calories int,
  tss numeric,
  zone_seconds int[],               -- Z1..Z5
  gear text,
  session_type text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, garmin_id)
);
create index activities_user_date on public.activities (user_id, activity_date desc);
create index activities_user_sport_date on public.activities (user_id, sport, activity_date);

-- ───────────── Saúde diária ─────────────
create table public.daily_wellness (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sleep_s int, sleep_score int, deep_s int, rem_s int, light_s int, awake_s int,
  hrv numeric, rhr int, stress_avg int, bb_morning int, steps int, hydration_ml int,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ───────────── Sugestões (estado do feedback Seguir/Ignorar) ─────────────
create table public.suggestions (
  id text not null,                  -- "<regra>:<data>"
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  rule text not null,
  severity text not null,
  title text not null,
  action text not null,
  reason text not null,
  confidence text not null,
  data jsonb,
  status text not null default 'new' check (status in ('new','followed','ignored','not_applicable')),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ───────────── Dashboards e análises guardadas ─────────────
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  widgets jsonb not null default '[]',   -- [{i,type,config}]
  layouts jsonb not null default '{}',   -- {lg:[{i,x,y,w,h}], md:[…], sm:[…]}
  position int not null default 0,
  updated_at timestamptz not null default now()
);
create unique index dashboards_one_default on public.dashboards (user_id) where is_default;

create table public.saved_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query jsonb not null,
  chart text not null default 'table',
  created_at timestamptz not null default now()
);

-- ───────────── Registo de sincronizações ─────────────
create table public.sync_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                -- 'incremental' | 'backfill' | 'key'
  data_type text,
  range_from date, range_to date,
  records int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_log_user on public.sync_log (user_id, started_at desc);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array['athlete_profile','garmin_connection','activities','daily_wellness','suggestions','dashboards','saved_analyses','sync_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select using (auth.uid() = user_id)', t);
  end loop;
  -- tabelas que o utilizador edita diretamente
  foreach t in array array['athlete_profile','suggestions','dashboards','saved_analyses'] loop
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
  -- activities, daily_wellness, garmin_connection e sync_log são escritas só pela Edge Function (service role)
end $$;

-- Referência ao segredo do Vault numa tabela à parte, sem políticas: invisível para anon/authenticated
create table public.garmin_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_secret_id uuid not null
);
alter table public.garmin_secrets enable row level security;
revoke all on public.garmin_secrets from anon, authenticated;

-- ───────────── Vault: guardar e ler a chave (só service role) ─────────────
create or replace function public.garmin_set_key(p_user uuid, p_key text, p_expires date)
returns void language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select key_secret_id into sid from public.garmin_secrets where user_id = p_user;
  if sid is null then
    sid := vault.create_secret(p_key, 'garmin_key_' || p_user::text, 'Garmin Personal API key');
    insert into public.garmin_secrets (user_id, key_secret_id) values (p_user, sid);
  else
    perform vault.update_secret(sid, p_key);
  end if;
  insert into public.garmin_connection (user_id, status, key_expires_at, last_error, updated_at)
  values (p_user, 'connected', p_expires, null, now())
  on conflict (user_id) do update set status = 'connected', key_expires_at = p_expires, last_error = null, updated_at = now();
end $$;

create or replace function public.garmin_get_key(p_user uuid)
returns text language sql security definer set search_path = public, vault as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join public.garmin_secrets g on g.key_secret_id = s.id
  where g.user_id = p_user;
$$;

revoke all on function public.garmin_set_key(uuid, text, date) from public, anon, authenticated;
revoke all on function public.garmin_get_key(uuid) from public, anon, authenticated;
grant execute on function public.garmin_set_key(uuid, text, date) to service_role;
grant execute on function public.garmin_get_key(uuid) to service_role;

-- ───────────── Agregados para estatísticas ─────────────
-- Vista materializada por dia e modalidade; alimenta widgets e comparações anuais sem ler todas as atividades.
create materialized view public.stats_daily as
select user_id, activity_date as day, sport, sub_sport,
       count(*)::int as sessions,
       sum(duration_s)::bigint as duration_s,
       sum(distance_m) as distance_m,
       sum(elevation_m) as elevation_m,
       sum(coalesce(tss, 0)) as tss,
       sum(coalesce(calories, 0))::bigint as calories
from public.activities
group by 1, 2, 3, 4;
create unique index stats_daily_pk on public.stats_daily (user_id, day, sport, sub_sport);

create materialized view public.stats_weekly as
select user_id, date_trunc('week', day)::date as week_start, sport,
       sum(sessions)::int as sessions, sum(duration_s)::bigint as duration_s,
       sum(distance_m) as distance_m, sum(elevation_m) as elevation_m, sum(tss) as tss
from public.stats_daily
group by 1, 2, 3;
create unique index stats_weekly_pk on public.stats_weekly (user_id, week_start, sport);

-- As vistas materializadas não suportam RLS: expor só através de funções que filtram por auth.uid()
revoke all on public.stats_daily, public.stats_weekly from anon, authenticated;

create or replace function public.my_stats_daily(p_from date, p_to date)
returns setof public.stats_daily language sql stable security definer set search_path = public as $$
  select * from public.stats_daily where user_id = auth.uid() and day between p_from and p_to;
$$;

create or replace function public.refresh_stats() returns void language sql security definer set search_path = public as $$
  refresh materialized view concurrently public.stats_daily;
  refresh materialized view concurrently public.stats_weekly;
$$;
revoke all on function public.refresh_stats() from public, anon, authenticated;
grant execute on function public.refresh_stats() to service_role;

-- ───────────── Criar perfil e dashboard por defeito no registo ─────────────
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athlete_profile (user_id) values (new.id) on conflict do nothing;
  insert into public.garmin_connection (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Sincronização de hora a hora ─────────────
-- Substituir <PROJECT_REF> e <SERVICE_ROLE_KEY> (ou usar um segredo do Vault) depois de publicar a função.
-- select cron.schedule('garmin-sync-hourly', '7 * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/garmin-sync',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := '{"action":"cron"}'::jsonb);
-- $$);
