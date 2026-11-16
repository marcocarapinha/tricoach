-- TriCoach · produção: agendamentos (pg_cron) sem chaves em SQL e correções do Security Advisor

-- pg_net no esquema extensions (recomendação do Security Advisor)
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;

-- ───────────── Funções security definer: só quem precisa ─────────────
-- trigger de registo: não deve ser chamada pela API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- estatísticas: só utilizadores autenticados
revoke execute on function public.my_stats_daily(date, date) from public, anon;
grant execute on function public.my_stats_daily(date, date) to authenticated;
-- (public.mfa_ok fica executável por authenticated de propósito: as políticas RLS chamam-na)

-- ───────────── Segredo partilhado entre pg_cron e as Edge Functions ─────────────
-- Gerado na própria base de dados e guardado no Vault: nunca aparece em código nem em logs.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tricoach_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'tricoach_cron_secret',
      'Cabeçalho x-cron-secret das chamadas do pg_cron às Edge Functions');
  end if;
end $$;

create or replace function public.cron_secret_ok(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'tricoach_cron_secret' and decrypted_secret = p);
$$;
revoke all on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;

-- ───────────── Agendamentos ─────────────
-- Uso (uma vez, com o URL do projeto): select public.tricoach_schedule_jobs('https://<ref>.supabase.co');
create or replace function public.tricoach_schedule_jobs(p_base_url text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  hdr text := $h$jsonb_build_object('Content-Type','application/json','x-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'tricoach_cron_secret'))$h$;
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('tricoach-garmin-sync', 'tricoach-notify');
  -- sincronização Garmin de hora a hora (minuto 7)
  perform cron.schedule('tricoach-garmin-sync', '7 * * * *', format(
    'select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 120000)',
    p_base_url || '/functions/v1/garmin-sync', hdr, '{"action":"cron"}'));
  -- resumo diário por push (a função só envia a quem tem notify_hour = hora local)
  perform cron.schedule('tricoach-notify', '15 * * * *', format(
    'select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 60000)',
    p_base_url || '/functions/v1/notify', hdr, '{"action":"cron"}'));
end $$;
revoke all on function public.tricoach_schedule_jobs(text) from public, anon, authenticated;
