// Autenticação comum às Edge Functions.
// As funções usam a chave de serviço (que ignora RLS) para escrever, por isso repetem aqui
// a regra do 2FA: quem tem um fator TOTP verificado precisa de uma sessão aal2.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PUBLISHABLE_KEY, SUPABASE_URL } from "./env.ts";

export type AuthResult = { user: User; error?: undefined } | { user?: undefined; error: string; status: number };

export async function authenticate(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { error: "Sessão inválida", status: 401 };
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Sessão inválida", status: 401 };
  // avaliada com o JWT do próprio utilizador (aal + fatores verificados)
  const { data: ok, error: mfaErr } = await client.rpc("mfa_ok");
  if (mfaErr) return { error: `Não foi possível validar o 2FA: ${mfaErr.message}`, status: 500 };
  if (ok !== true) return { error: "Confirme o código de autenticação de dois fatores.", status: 403 };
  return { user };
}

/**
 * Chamadas do pg_cron: trazem o cabeçalho x-cron-secret, comparado com o segredo guardado no Vault
 * (public.cron_secret_ok só pode ser chamada com a chave secreta, ou seja, por esta função).
 */
export async function isCronCall(req: Request, admin: SupabaseClient): Promise<boolean> {
  const given = req.headers.get("x-cron-secret");
  if (!given || given.length < 32) return false;
  const { data, error } = await admin.rpc("cron_secret_ok", { p: given });
  return !error && data === true;
}
