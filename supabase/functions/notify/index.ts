// Edge Function: notify
//   { action: "test" }        → (utilizador) envia uma notificação de teste para os dispositivos do próprio
//   { action: "public-key" }  → (utilizador) chave pública VAPID para a subscrição push
//   { action: "cron" }        → (pg_cron, de hora a hora) envia o resumo diário a quem tem notify_hour = hora local
// Requer VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (ex.: mailto:eu@exemplo.pt).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { authenticate, isCronCall } from "../_shared/auth.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/env.ts";
import { dailyDigest, localDate, localHour } from "../_shared/daily-digest.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function vapid() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) throw new Error("Chaves VAPID não configuradas (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:tricoach@localhost", pub, priv);
}

async function sendToUser(db: SupabaseClient, userId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      // 404/410: subscrição expirada · 403: subscrição criada com outra chave VAPID → já não serve
      if (code === 404 || code === 410 || code === 403) await db.from("push_subscriptions").delete().eq("id", s.id);
      const host = (() => { try { return new URL(s.endpoint).host; } catch { return "?"; } })();
      errors.push(`${host}: ${code ?? ""} ${code === 403 ? "chave VAPID diferente da usada na subscrição" : (e?.body || e?.message || String(e))}`.trim());
    }
  }
  return { subs: subs?.length ?? 0, sent, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  try {
    vapid();
    const body = await req.json().catch(() => ({}));

    if (body.action === "cron") {
      if (!(await isCronCall(req, db))) return json({ error: "forbidden" }, 403);
      const now = new Date();
      const { data: profiles } = await db.from("athlete_profile").select("user_id, notify_hour, timezone").eq("notify_enabled", true);
      const out: Record<string, unknown> = {};
      for (const p of profiles ?? []) {
        const tz = p.timezone || "Europe/Lisbon";
        if (localHour(now, tz) !== p.notify_hour) continue;
        const today = localDate(now, tz);
        const { data: already } = await db.from("notification_log").select("id").eq("user_id", p.user_id).eq("day", today).eq("kind", "daily").maybeSingle();
        if (already) continue;
        const from = new Date(Date.parse(today) - 70 * 864e5).toISOString().slice(0, 10);
        const [{ data: well }, { data: planned }] = await Promise.all([
          db.from("daily_wellness").select("day, hrv, rhr, sleep_s").eq("user_id", p.user_id).gte("day", from),
          db.from("planned_sessions").select("sport, session_type, duration_min, title").eq("user_id", p.user_id).eq("day", today),
        ]);
        const d = dailyDigest(well ?? [], planned ?? [], today);
        const { sent } = await sendToUser(db, p.user_id, { title: d.title, body: d.body, url: "/", tag: "tricoach-daily" });
        if (sent) await db.from("notification_log").insert({ user_id: p.user_id, day: today, kind: "daily", title: d.title, body: d.body });
        out[p.user_id] = { sent, rules: d.rules };
      }
      return json({ ok: true, users: out });
    }

    const a = await authenticate(req);
    if (!a.user) return json({ error: a.error }, a.status);
    const user = a.user;
    if (body.action === "public-key") return json({ ok: true, publicKey: Deno.env.get("VAPID_PUBLIC_KEY") });
    if (body.action === "test") {
      const r = await sendToUser(db, user.id, { title: "TriCoach · Teste", body: "As notificações estão a funcionar. Vai receber o resumo diário à hora escolhida.", url: "/definicoes", tag: "tricoach-test" });
      if (!r.subs) return json({ error: "Nenhum dispositivo subscrito. Desative e volte a ativar as notificações neste browser." }, 400);
      if (!r.sent) return json({ error: `O envio falhou em ${r.subs} dispositivo(s): ${r.errors.join("; ")}. Desative e volte a ativar as notificações neste browser.` }, 400);
      return json({ ok: true, sent: r.sent, failed: r.errors.length });
    }
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
