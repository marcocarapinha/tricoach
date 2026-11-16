-- TriCoach · treino funcional: zonas problemáticas no perfil e registo das rotinas feitas

alter table public.athlete_profile
  add column if not exists functional_areas text[] not null default '{}',
  add column if not exists functional_level text not null default 'intermediate' check (functional_level in ('beginner','intermediate','advanced')),
  add column if not exists functional_equipment text[] not null default '{band,step}';

create table public.functional_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mode text not null check (mode in ('full','short','mobility')),
  minutes int not null default 0,
  exercises text[] not null default '{}',
  areas text[] not null default '{}',
  done_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.functional_log enable row level security;
create policy "functional_log_select_own" on public.functional_log for select using (auth.uid() = user_id);
create policy "functional_log_insert_own" on public.functional_log for insert with check (auth.uid() = user_id);
create policy "functional_log_update_own" on public.functional_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "functional_log_delete_own" on public.functional_log for delete using (auth.uid() = user_id);
