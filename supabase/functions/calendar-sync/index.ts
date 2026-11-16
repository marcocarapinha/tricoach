// Edge Function: calendar-sync
// Lê um calendário .ics (do treinador ou de outras aplicações) e põe os treinos no plano (planned_sessions, source = 'calendar').
// Ações (POST JSON { action, ... }):
//   save-url { url }           → valida o endereço, guarda-o no Vault e importa
//   icloud-calendars { username, password }            → lista os calendários iCloud (CalDAV)
//   save-icloud { username, password, calendarUrl }    → guarda a ligação iCloud no Vault e importa
//   sync                       → volta a ler o calendário
//   remove                     → apaga a ligação (os treinos já importados ficam)
//   cron                       → (pg_cron, x-cron-secret) lê o calendário de todos os utilizadores ligados
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { authenticate, isCronCall } from "../_shared/auth.ts";
import { SECRET_KEY, SUPABASE_URL } from "../_shared/env.ts";
import { normalizeUrl } from "../_shared/url-guard.ts";
import {
  assertIcloudHost, basicAuth, calendarQuery, type CaldavConfig, ICLOUD_CALDAV, parseCalendarData, parseCalendars, parseHrefProp,
  PROPFIND_CALENDARS, PROPFIND_HOME, PROPFIND_PRINCIPAL,
} from "../_shared/caldav.ts";
import { icsEventToSessions, parseIcs, type WSport, type WType } from "../_shared/workout-text.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_BYTES = 3_000_000;
const TYPE_IF: Record<WType, number> = { recovery: 0.55, technique: 0.6, endurance: 0.68, long: 0.7, tempo: 0.82, intervals: 0.85, race: 0.9, functional: 0.5 };
const plannedTss = (sport: WSport, type: WType, min: number) => { const f = TYPE_IF[type] * (sport === "swim" ? 0.95 : 1); return Math.round((min / 60) * f * f * 100); };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

async function fetchIcs(url: URL): Promise<string> {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let r: Response;
    try { r = await fetch(cur, { redirect: "manual", signal: ctrl.signal, headers: { Accept: "text/calendar, */*" } }); }
    catch (e) { throw new Error(`Não foi possível ler o calendário: ${e instanceof Error ? e.message : e}`); }
    finally { clearTimeout(t); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = normalizeUrl(new URL(r.headers.get("location")!, cur).toString()); continue; }
    if (!r.ok) throw new Error(`O calendário respondeu ${r.status}. Confirme o endereço de subscrição do calendário.`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("Calendário demasiado grande");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("Calendário demasiado grande");
    const text = new TextDecoder().decode(buf);
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("O endereço não devolveu um calendário .ics");
    return text;
  }
  throw new Error("Demasiados redirecionamentos");
}

// ───────────── CalDAV (iCloud) ─────────────
async function dav(url: string, method: string, body: string, depth: string, auth: string): Promise<{ status: number; text: string; url: string }> {
  let cur = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    assertIcloudHost(cur); // as credenciais nunca saem do iCloud
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    let r: Response;
    try {
      r = await fetch(cur, { method, redirect: "manual", signal: ctrl.signal, body, headers: { Authorization: auth, Depth: depth, "Content-Type": "application/xml; charset=utf-8" } });
    } catch (e) { throw new Error(`Não foi possível contactar o iCloud: ${e instanceof Error ? e.message : e}`); }
    finally { clearTimeout(t); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location")!, cur); continue; }
    if (r.status === 401 || r.status === 403) throw new Error("O iCloud recusou o acesso. Confirme o email da conta Apple e use uma palavra-passe específica de app (não a palavra-passe normal).");
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error("Resposta do calendário demasiado grande");
    return { status: r.status, text, url: cur.toString() };
  }
  throw new Error("Demasiados redirecionamentos");
}

async function icloudCalendars(username: string, password: string) {
  const auth = basicAuth(username, password);
  let p = await dav(ICLOUD_CALDAV, "PROPFIND", PROPFIND_PRINCIPAL, "0", auth);
  let principal = parseHrefProp(p.text, "current-user-principal");
  if (!principal) { p = await dav(`${ICLOUD_CALDAV}.well-known/caldav`, "PROPFIND", PROPFIND_PRINCIPAL, "0", auth); principal = parseHrefProp(p.text, "current-user-principal"); }
  if (!principal) throw new Error(`O iCloud não respondeu como esperado (${p.status}).`);
  const h = await dav(new URL(principal, p.url).toString(), "PROPFIND", PROPFIND_HOME, "0", auth);
  const home = parseHrefProp(h.text, "calendar-home-set");
  if (!home) throw new Error("Não foi encontrada a pasta de calendários do iCloud.");
  const homeUrl = new URL(home, h.url).toString();
  const c = await dav(homeUrl, "PROPFIND", PROPFIND_CALENDARS, "1", auth);
  return parseCalendars(c.text, homeUrl);
}

async function fetchCaldavIcs(cfg: CaldavConfig): Promise<string> {
  const auth = basicAuth(cfg.username, cfg.password);
  const from = new Date(Date.now() - 7 * 864e5), to = new Date(Date.now() + 60 * 864e5);
  let r = await dav(cfg.calendarUrl, "REPORT", calendarQuery(from, to, true), "1", auth);
  // servidores sem suporte para expandir repetições: pede sem expandir
  if (r.status !== 207) r = await dav(cfg.calendarUrl, "REPORT", calendarQuery(from, to, false), "1", auth);
  if (r.status === 404) throw new Error("O calendário escolhido já não existe no iCloud. Volte a ligar e escolha outro.");
  if (r.status !== 207) throw new Error(`O iCloud respondeu ${r.status} ao ler o calendário.`);
  return "BEGIN:VCALENDAR\r\n" + parseCalendarData(r.text) + "\r\nEND:VCALENDAR";
}

async function importFor(db: SupabaseClient, userId: string, ics: string) {
  const { data: prof } = await db.from("athlete_profile").select("run_threshold_pace, css, timezone").eq("user_id", userId).maybeSingle();
  const paces = { runThresholdPace: prof?.run_threshold_pace ?? 270, css: prof?.css ?? 100 };
  const today = iso(new Date());
  const from = addDays(today, -7);
  const events = parseIcs(ics, prof?.timezone ?? "Europe/Lisbon").filter((e) => e.date >= from);
  const rows: Record<string, unknown>[] = [];
  // eventos repetidos (ocorrências com o mesmo UID) ficam distintos pela data
  const uidCount = new Map<string, number>();
  for (const e of events) uidCount.set(e.uid, (uidCount.get(e.uid) ?? 0) + 1);
  for (const e of events) {
    const uid = (uidCount.get(e.uid) ?? 0) > 1 ? `${e.uid}@${e.date}` : e.uid;
    icsEventToSessions(e, paces).forEach((s, k) => rows.push({
      user_id: userId, day: e.date, sport: s.sport, session_type: s.type, duration_min: s.durationMin,
      tss: plannedTss(s.sport, s.type, s.durationMin), title: s.title, description: s.description || null,
      steps: [{ kind: "step", intensity: "active", durationS: s.durationMin * 60, target: { type: "open" }, name: s.title.slice(0, 15) }],
      source: "calendar", external_id: `ics:${uid}${k ? `#${k}` : ""}`.slice(0, 300),
    }));
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("planned_sessions").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id" });
    if (error) throw error;
  }
  // treinos que saíram do calendário (dentro da janela que o calendário cobre) deixam de estar no plano
  const keep = new Set(rows.map((r) => r.external_id as string));
  const until = events.reduce((m, e) => (e.date > m ? e.date : m), addDays(today, 14));
  const { data: old } = await db.from("planned_sessions").select("id, external_id").eq("user_id", userId).eq("source", "calendar").gte("day", addDays(today, -5)).lte("day", until);
  const stale = (old ?? []).filter((o: any) => !keep.has(o.external_id)).map((o: any) => o.id);
  if (stale.length) await db.from("planned_sessions").delete().in("id", stale);
  await db.from("calendar_feed").update({ status: "connected", last_sync_at: new Date().toISOString(), last_error: null, events: rows.length, updated_at: new Date().toISOString() }).eq("user_id", userId);
  return { imported: rows.length, removed: stale.length };
}

async function syncUser(db: SupabaseClient, userId: string) {
  const { data: secret, error } = await db.rpc("calendar_get_url", { p_user: userId });
  if (error || !secret) throw new Error("Calendário não ligado");
  try {
    const s = String(secret);
    const ics = s.startsWith("{") ? await fetchCaldavIcs(JSON.parse(s) as CaldavConfig) : await fetchIcs(normalizeUrl(s));
    return await importFor(db, userId, ics);
  } catch (e) {
    await db.from("calendar_feed").update({ status: "error", last_error: e instanceof Error ? e.message : String(e), updated_at: new Date().toISOString() }).eq("user_id", userId);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "cron") {
      if (!(await isCronCall(req, db))) return json({ error: "forbidden" }, 403);
      const { data: feeds } = await db.from("calendar_feed").select("user_id");
      const out: Record<string, unknown> = {};
      for (const f of feeds ?? []) {
        try { out[f.user_id] = await syncUser(db, f.user_id); } catch (e) { out[f.user_id] = { error: String(e) }; }
      }
      return json({ ok: true, users: out });
    }

    const a = await authenticate(req);
    if (!a.user) return json({ error: a.error }, a.status);
    const user = a.user;

    switch (body.action) {
      case "save-url": {
        const url = normalizeUrl(String(body.url ?? ""));
        const provider = "ics";
        const ics = await fetchIcs(url); // valida antes de guardar
        const { error } = await db.rpc("calendar_set_url", { p_user: user.id, p_url: url.toString(), p_provider: provider });
        if (error) throw error;
        return json({ ok: true, ...(await importFor(db, user.id, ics)) });
      }
      case "icloud-calendars": {
        const username = String(body.username ?? "").trim(), password = String(body.password ?? "").replace(/\s+/g, "");
        if (!username.includes("@") || password.length < 12) return json({ error: "Indique o email da conta Apple e a palavra-passe específica de app (16 letras)." }, 400);
        return json({ ok: true, calendars: await icloudCalendars(username, password) });
      }
      case "save-icloud": {
        const username = String(body.username ?? "").trim(), password = String(body.password ?? "").replace(/\s+/g, "");
        const calendarUrl = new URL(String(body.calendarUrl ?? ""));
        assertIcloudHost(calendarUrl);
        const cfg: CaldavConfig = { type: "caldav", server: ICLOUD_CALDAV, username, password, calendarUrl: calendarUrl.toString(), calendarName: String(body.calendarName ?? "").slice(0, 80) };
        const ics = await fetchCaldavIcs(cfg); // valida antes de guardar
        const { error } = await db.rpc("calendar_set_url", { p_user: user.id, p_url: JSON.stringify(cfg), p_provider: "icloud" });
        if (error) throw error;
        return json({ ok: true, ...(await importFor(db, user.id, ics)) });
      }
      case "sync": {
        const { data: f } = await db.from("calendar_feed").select("last_sync_at").eq("user_id", user.id).maybeSingle();
        if (f?.last_sync_at && Date.now() - Date.parse(f.last_sync_at) < 30_000) return json({ error: "Leu o calendário há poucos segundos. Tente de novo daqui a pouco." }, 429);
        return json({ ok: true, ...(await syncUser(db, user.id)) });
      }
      case "remove": {
        const { error } = await db.rpc("calendar_remove", { p_user: user.id });
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return json({ error: msg }, 400);
  }
});
