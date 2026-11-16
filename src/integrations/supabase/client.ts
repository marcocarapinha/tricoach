import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/**
 * Sessão em sessionStorage (e não localStorage): apaga-se ao fechar o separador e não fica
 * disponível a outros separadores nem persiste no disco. O token de acesso dura 1 h e os tokens
 * de renovação são de uso único (config.toml). A CSP do build limita os scripts que podem correr.
 */
const storage = typeof window !== "undefined" ? window.sessionStorage : undefined;

// limpar sessões antigas que versões anteriores deixaram no localStorage
try {
  for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k);
} catch { /* sem armazenamento */ }

/** null quando o Supabase não está configurado → a app corre em modo demo. */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storage, storageKey: "tricoach.auth" } })
  : null;
