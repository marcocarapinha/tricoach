-- TriCoach · assistente inicial: data em que o utilizador concluiu a configuração guiada
alter table public.athlete_profile add column if not exists onboarded_at timestamptz;
