// Edge Function: garmin-sync
// Ações (POST JSON { action, ... }):
//   save-key      { apiKey, expiresAt }  → valida a chave, guarda-a no Vault e prepara a importação de 4 anos
//   sync          { days? }              → importação incremental (últimos dias)
//   backfill-step                         → importa o bloco seguinte do histórico (90 dias); o frontend repete até done
//   status                                → estado da ligação
//   cron                                  → (service role) sync + 3 blocos de histórico para todos os utilizadores ligados
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { authenticate, isCronCall } from "../_shared/auth.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/env.ts";
import { type DataType, ENDPOINTS, fetchRange, getAccessToken, mapWellness, prepareActivities, windows } from "../_shared/garmin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYNC_MIN_INTERVAL_S = 60;
const HISTORY_YEARS = 4;
const TYPES: DataType[] = ["activities", "dailySummaries", "sleep", "hrv"];
/** Bloco de histórico por chamada: 90 dias = 1 pedido de resumos diários, 3 de sono, 4 de HRV, 3+ de atividades. */
const CHUNK = 90;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const today = () => iso(new Date());

async function importRange(db: SupabaseClient, userId: string, token: string, from: string, to: string, kind: string) {
  let total = 0;
  const errors: string[] = [];
  for (const type of TYPES) {
    for (const [a, b] of windows(from, to, ENDPOINTS[type].maxDays)) {
      const started = new Date().toISOString();
      try {
        const items = await fetchRange(token, type, a, b);
        let n = 0;
        if (type === "activities") {
          const rows = prepareActivities(items, userId);
          if (rows.length) {
            const { error } = await db.from("activities").upsert(rows, { onConflict: "user_id,garmin_id" });
            if (error) throw error;
          }
          n = rows.length;
        } else {
          const byDay = mapWellness(type as Exclude<DataType, "activities">, items);
          const days = Object.keys(byDay);
          if (days.length) {
            // juntar com o que já existe nesse dia (cada tipo preenche colunas diferentes)
            const { data: existing } = await db.from("daily_wellness").select("day, raw").eq("user_id", userId).in("day", days);
            const rawOf = new Map((existing ?? []).map((e: any) => [e.day, e.raw ?? {}]));
            const rows = days.map((day) => ({ user_id: userId, day, ...byDay[day], raw: { ...(rawOf.get(day) ?? {}), ...byDay[day].raw }, updated_at: new Date().toISOString() }));
            const { error } = await db.from("daily_wellness").upsert(rows, { onConflict: "user_id,day" });
            if (error) throw error;
          }
          n = days.length;
        }
        total += n;
        await db.from("sync_log").insert({ user_id: userId, kind, data_type: type, range_from: a, range_to: b, records: n, started_at: started, finished_at: new Date().toISOString() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        await db.from("sync_log").insert({ user_id: userId, kind, data_type: type, range_from: a, range_to: b, error: msg, started_at: started, finished_at: new Date().toISOString() });
      }
    }
  }
  return { total, errors };
}

async function tokenFor(db: SupabaseClient, userId: string) {
  const { data: key, error } = await db.rpc("garmin_get_key", { p_user: userId });
  if (error || !key) throw new Error("Chave Garmin não configurada");
  try {
    return (await getAccessToken(key as string)).token;
  } catch (e) {
    await db.from("garmin_connection").update({ status: "error", last_error: String(e), updated_at: new Date().toISOString() }).eq("user_id", userId);
    throw e;
  }
}

async function incremental(db: SupabaseClient, userId: string, days?: number) {
  const { data: conn } = await db.from("garmin_connection").select("*").eq("user_id", userId).single();
  const since = days ? addDays(today(), -days) : conn?.last_sync_at ? addDays(String(conn.last_sync_at).slice(0, 10), -2) : addDays(today(), -7);
  const token = await tokenFor(db, userId);
  const res = await importRange(db, userId, token, since, today(), "incremental");
  await db.from("garmin_connection").update({ last_sync_at: new Date().toISOString(), status: "connected", last_error: res.errors[0] ?? null, updated_at: new Date().toISOString() }).eq("user_id", userId);
  await db.rpc("refresh_stats");
  return res;
}

async function backfillStep(db: SupabaseClient, userId: string, token?: string) {
  const { data: conn } = await db.from("garmin_connection").select("*").eq("user_id", userId).single();
  if (!conn || conn.backfill_done) return { done: true, progress: 1 };
  const floor = conn.backfill_from ?? addDays(today(), -365 * HISTORY_YEARS);
  const cursor = conn.backfill_cursor ?? today();
  const from = addDays(cursor, -(CHUNK - 1)) < floor ? floor : addDays(cursor, -(CHUNK - 1));
  const res = await importRange(db, userId, token ?? (await tokenFor(db, userId)), from, cursor, "backfill");
  const next = addDays(from, -1);
  const done = next < floor;
  const span = (Date.parse(today()) - Date.parse(floor)) / 864e5;
  const progress = Math.min(1, (Date.parse(today()) - Date.parse(from)) / 864e5 / span);
  await db.from("garmin_connection").update({ backfill_cursor: next, backfill_done: done, updated_at: new Date().toISOString(), last_error: res.errors[0] ?? null }).eq("user_id", userId);
  if (done) await db.rpc("refresh_stats");
  return { done, progress, from, to: cursor, records: res.total, errors: res.errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "cron") {
      if (!(await isCronCall(req, db))) return json({ error: "forbidden" }, 403);
      const { data: users } = await db.from("garmin_connection").select("user_id").eq("status", "connected");
      const out: Record<string, unknown> = {};
      for (const u of users ?? []) {
        try {
          out[u.user_id] = await incremental(db, u.user_id);
          const token = await tokenFor(db, u.user_id);
          for (let i = 0; i < 3; i++) { const r = await backfillStep(db, u.user_id, token); if (r.done) break; }
        } catch (e) { out[u.user_id] = { error: String(e) }; }
      }
      return json({ ok: true, users: out });
    }

    // restantes ações: utilizador autenticado
    const a = await authenticate(req);
    if (!a.user) return json({ error: a.error }, a.status);
    const user = a.user;

    switch (body.action) {
      case "save-key": {
        const apiKey = String(body.apiKey ?? "").trim();
        if (apiKey.length < 10) return json({ error: "Chave inválida" }, 400);
        await getAccessToken(apiKey); // valida antes de guardar
        const { error } = await db.rpc("garmin_set_key", { p_user: user.id, p_key: apiKey, p_expires: body.expiresAt ?? null });
        if (error) throw error;
        await db.from("garmin_connection").update({ backfill_from: addDays(today(), -365 * HISTORY_YEARS), backfill_cursor: today(), backfill_done: false }).eq("user_id", user.id);
        await db.from("sync_log").insert({ user_id: user.id, kind: "key", records: 0, finished_at: new Date().toISOString() });
        return json({ ok: true });
      }
      case "sync": {
        // limite: uma sincronização manual por minuto (protege a quota da API Garmin)
        const { data: c } = await db.from("garmin_connection").select("last_sync_at").eq("user_id", user.id).maybeSingle();
        const ago = c?.last_sync_at ? (Date.now() - Date.parse(c.last_sync_at)) / 1000 : Infinity;
        if (ago < SYNC_MIN_INTERVAL_S) {
          const wait = Math.ceil(SYNC_MIN_INTERVAL_S - ago);
          return new Response(JSON.stringify({ error: `Sincronizou há pouco. Tente de novo dentro de ${wait} s.` }), { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(wait) } });
        }
        return json({ ok: true, ...(await incremental(db, user.id, body.days)) });
      }
      case "backfill-step":
        return json({ ok: true, ...(await backfillStep(db, user.id)) });
      case "status": {
        const { data } = await db.from("garmin_connection").select("*").eq("user_id", user.id).single();
        return json({ ok: true, connection: data });
      }
      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
