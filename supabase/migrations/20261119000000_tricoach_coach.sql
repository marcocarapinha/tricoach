-- TriCoach · plano do treinador, dias de descanso e calendário externo (TrainingPeaks .ics)

-- ───────────── Perfil ─────────────
alter table public.athlete_profile
  -- 'app': a app propõe o plano · 'coach': o atleta tem treinador e importa os treinos
  add column if not exists plan_source text not null default 'app' check (plan_source in ('app', 'coach')),
  -- dias de descanso habituais (0 = segunda … 6 = domingo); vazio = a app escolhe
  add column if not exists rest_days smallint[] not null default '{}';

-- ───────────── Dias de descanso por semana (sobrepõem-se aos habituais) ─────────────
create table if not exists public.week_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  rest_days smallint[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.week_settings enable row level security;
drop policy if exists "week_settings_select_own" on public.week_settings;
drop policy if exists "week_settings_insert_own" on public.week_settings;
drop policy if exists "week_settings_update_own" on public.week_settings;
drop policy if exists "week_settings_delete_own" on public.week_settings;
drop policy if exists "week_settings_require_mfa" on public.week_settings;
create policy "week_settings_select_own" on public.week_settings for select using (auth.uid() = user_id);
create policy "week_settings_insert_own" on public.week_settings for insert with check (auth.uid() = user_id);
create policy "week_settings_update_own" on public.week_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "week_settings_delete_own" on public.week_settings for delete using (auth.uid() = user_id);
create policy "week_settings_require_mfa" on public.week_settings as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ───────────── Origem das sessões planeadas ─────────────
alter table public.planned_sessions
  add column if not exists source text not null default 'app' check (source in ('app', 'manual', 'coach', 'calendar', 'functional')),
  add column if not exists external_id text;
-- índice completo (não parcial) para o upsert por (user_id, external_id) funcionar; NULLs não colidem
create unique index if not exists planned_sessions_external on public.planned_sessions (user_id, external_id);

-- ───────────── Calendário externo (URL .ics no Vault) ─────────────
create table if not exists public.calendar_feed (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'trainingpeaks',
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_sync_at timestamptz,
  last_error text,
  events int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.calendar_feed enable row level security;
drop policy if exists "calendar_feed_select_own" on public.calendar_feed;
drop policy if exists "calendar_feed_require_mfa" on public.calendar_feed;
create policy "calendar_feed_select_own" on public.calendar_feed for select using (auth.uid() = user_id);
create policy "calendar_feed_require_mfa" on public.calendar_feed as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

create table if not exists public.calendar_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null
);
alter table public.calendar_secrets enable row level security;
revoke all on public.calendar_secrets from anon, authenticated;

create or replace function public.calendar_set_url(p_user uuid, p_url text, p_provider text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select secret_id into sid from public.calendar_secrets where user_id = p_user;
  if sid is null then
    sid := vault.create_secret(p_url, 'calendar_url_' || p_user::text, 'URL do calendário .ics');
    insert into public.calendar_secrets (user_id, secret_id) values (p_user, sid);
  else
    perform vault.update_secret(sid, p_url);
  end if;
  insert into public.calendar_feed (user_id, provider, status, last_error, updated_at)
  values (p_user, p_provider, 'connected', null, now())
  on conflict (user_id) do update set provider = p_provider, status = 'connected', last_error = null, updated_at = now();
end $$;

create or replace function public.calendar_get_url(p_user uuid)
returns text language sql security definer set search_path = public, vault as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join public.calendar_secrets c on c.secret_id = s.id
  where c.user_id = p_user;
$$;

create or replace function public.calendar_remove(p_user uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select secret_id into sid from public.calendar_secrets where user_id = p_user;
  delete from public.calendar_secrets where user_id = p_user;
  if sid is not null then delete from vault.secrets where id = sid; end if;
  delete from public.calendar_feed where user_id = p_user;
end $$;

revoke all on function public.calendar_set_url(uuid, text, text) from public, anon, authenticated;
revoke all on function public.calendar_get_url(uuid) from public, anon, authenticated;
revoke all on function public.calendar_remove(uuid) from public, anon, authenticated;
grant execute on function public.calendar_set_url(uuid, text, text) to service_role;
grant execute on function public.calendar_get_url(uuid) to service_role;
grant execute on function public.calendar_remove(uuid) to service_role;

-- ───────────── Agendamentos: acrescentar a sincronização do calendário (de 3 em 3 horas) ─────────────
create or replace function public.tricoach_schedule_jobs(p_base_url text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  hdr text := $h$jsonb_build_object('Content-Type','application/json','x-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'tricoach_cron_secret'))$h$;
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('tricoach-garmin-sync', 'tricoach-notify', 'tricoach-calendar-sync');
  perform cron.schedule('tricoach-garmin-sync', '7 * * * *', format(
    'select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 120000)',
    p_base_url || '/functions/v1/garmin-sync', hdr, '{"action":"cron"}'));
  perform cron.schedule('tricoach-notify', '15 * * * *', format(
    'select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 60000)',
    p_base_url || '/functions/v1/notify', hdr, '{"action":"cron"}'));
  perform cron.schedule('tricoach-calendar-sync', '37 */3 * * *', format(
    'select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 60000)',
    p_base_url || '/functions/v1/calendar-sync', hdr, '{"action":"cron"}'));
end $$;
revoke all on function public.tricoach_schedule_jobs(text) from public, anon, authenticated;
