-- TriCoach · segurança: 2FA (TOTP) opcional aplicado no servidor
--
-- Quem tem um fator TOTP verificado só consegue ler ou escrever os seus dados com uma sessão
-- de nível aal2 (palavra-passe + código). Quem não ativou o 2FA continua com aal1.
-- A regra vive na base de dados (políticas RESTRICTIVE), por isso não pode ser contornada
-- a partir do browser; as Edge Functions fazem a mesma verificação com public.mfa_ok().

create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

-- Política restritiva em todas as tabelas com dados do utilizador (soma-se às políticas por user_id)
do $$
declare t text;
begin
  foreach t in array array[
    'athlete_profile','garmin_connection','activities','daily_wellness','suggestions','dashboards',
    'saved_analyses','sync_log','races','planned_sessions','checkins','activity_streams',
    'push_subscriptions','notification_log','functional_log'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())',
      t || '_require_mfa', t);
  end loop;
end $$;

-- A função de estatísticas é security definer (ignora RLS): aplicar a mesma regra
create or replace function public.my_stats_daily(p_from date, p_to date)
returns setof public.stats_daily language sql stable security definer set search_path = public as $$
  select * from public.stats_daily
  where user_id = auth.uid() and day between p_from and p_to and public.mfa_ok();
$$;
