// Chaves do Supabase dentro das Edge Functions.
// Projetos alojados: SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (JSON com chaves por nome).
// CLI local: SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY. Recurso: chaves legadas anon / service_role.
function pick(jsonVar: string, single: string, legacy: string): string {
  const raw = Deno.env.get(jsonVar);
  if (raw) {
    try {
      const o = JSON.parse(raw) as Record<string, string>;
      const v = o["default"] ?? Object.values(o)[0];
      if (v) return v;
    } catch { /* formato inesperado: tenta as outras */ }
  }
  const v = Deno.env.get(single) ?? Deno.env.get(legacy);
  if (!v) throw new Error(`Variável ${jsonVar} / ${legacy} em falta`);
  return v;
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const PUBLISHABLE_KEY = pick("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
export const SECRET_KEY = pick("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
