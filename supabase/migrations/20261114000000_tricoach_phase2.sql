-- TriCoach · Fase 2 · provas, plano, check-ins, detalhe de atividade, recordes e notificações push

-- ───────────── Provas ─────────────
create table public.races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_date date not null,
  name text not null,
  distance text not null default 'olympic' check (distance in ('sprint','olympic','half','full','other')),
  priority text not null default 'B' check (priority in ('A','B','C')),
  goal_time_s int,
  result_time_s int,
  location text,
  notes text,
  created_at timestamptz not null default now()
);
create index races_user_date on public.races (user_id, race_date);

-- a "próxima prova" da Fase 1 passa a ser uma linha de races
insert into public.races (user_id, race_date, name, priority)
select user_id, (next_race->>'date')::date, coalesce(nullif(next_race->>'name', ''), 'Prova'), coalesce(next_race->>'priority', 'A')
from public.athlete_profile
where next_race ? 'date' and (next_race->>'date') ~ '^\d{4}-\d{2}-\d{2}$';

-- ───────────── Plano ─────────────
create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sport text not null check (sport in ('swim','bike','run','brick','strength','other')),
  session_type text not null,
  duration_min int not null check (duration_min between 0 and 1440),
  tss numeric,
  title text not null,
  description text,
  steps jsonb,                      -- WorkoutStep[] (exportável para FIT)
  created_at timestamptz not null default now()
);
create index planned_sessions_user_day on public.planned_sessions (user_id, day);

-- ───────────── Check-in subjetivo ─────────────
create table public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  energy smallint not null check (energy between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  mood smallint not null check (mood between 1 and 5),
  motivation smallint not null check (motivation between 1 and 5),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ───────────── Detalhe de atividade (ficheiro FIT) ─────────────
create table public.activity_streams (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sample_s int not null default 5,
  streams jsonb not null,           -- { t, hr, power, speed, cadence, alt, dist }
  laps jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

-- melhores marcas por atividade (fastestSplit_* e maxAvgPower_* do SummarizedActivityDTO)
alter table public.activities add column if not exists bests jsonb;

-- ───────────── Notificações ─────────────
alter table public.athlete_profile
  add column if not exists notify_enabled boolean not null default false,
  add column if not exists notify_hour int not null default 7 check (notify_hour between 0 and 23),
  add column if not exists timezone text not null default 'Europe/Lisbon';

update public.athlete_profile
set readiness_weights = readiness_weights || '{"feel":10}'::jsonb
where not readiness_weights ? 'feel';
alter table public.athlete_profile alter column readiness_weights set default '{"hrv":30,"sleep":25,"tsb":20,"rhr":15,"energy":10,"feel":10}';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,               -- 'daily' | regra
  title text not null,
  body text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, day, kind)
);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array['races','planned_sessions','checkins','activity_streams','push_subscriptions','notification_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select using (auth.uid() = user_id)', t);
  end loop;
  foreach t in array array['races','planned_sessions','checkins','push_subscriptions'] loop
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
  -- activity_streams e notification_log são escritas só pelas Edge Functions (service role)
end $$;

-- ───────────── Resumo diário por push ─────────────
-- Corre de hora a hora; a função envia só a quem tem notify_hour = hora local atual.
-- select cron.schedule('tricoach-notify-hourly', '15 * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := '{"action":"cron"}'::jsonb);
-- $$);
