import { raceSportOf } from "../types";
import type { Activity, ActivityStreams, AthleteProfile, CheckIn, Dashboard, FunctionalLog, GarminConnection, PlannedSession, Race, Suggestion, SuggestionStatus, WeekSetting, Wellness } from "../types";
import { DEFAULT_PROFILE } from "../types";
import type { StatsQuery } from "../engine/stats";
import { demoCheckins, demoRaces, demoStreams, generateDemo } from "../demo";
import { addDays, startOfWeek, todayISO } from "../dates";
import { loadSeries } from "../engine/load";
import { buildSeason, nextRace as findNextRace, weekTarget } from "../engine/periodization";
import { generateWeek } from "../engine/plan";
import { supabase } from "@/integrations/supabase/client";
import { defaultDashboards } from "./defaults";

export interface NextRace { date: string; name: string; priority: "A" | "B" | "C" }
export interface SavedAnalysis { id: string; name: string; query: StatsQuery; chart: "table" | "bars" | "cumulative" }

export interface CoreData {
  activities: Activity[];
  wellness: Wellness[];
  profile: AthleteProfile;
  races: Race[];
  planned: PlannedSession[];
  checkins: CheckIn[];
  functionalLog: FunctionalLog[];
  /** dias de descanso escolhidos para semanas concretas */
  weekSettings: WeekSetting[];
  /** derivado de `races`: a próxima prova (qualquer prioridade) */
  nextRace: NextRace | null;
}

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

export interface CalendarFeed { provider: string; status: "connected" | "error"; lastSyncAt: string | null; lastError: string | null; events: number }

export interface BackfillStep { done: boolean; progress: number; from?: string; to?: string; records?: number; errors?: string[] }

export interface Store {
  mode: "demo" | "supabase";
  loadCore(): Promise<CoreData>;
  saveProfile(p: AthleteProfile): Promise<void>;
  saveRace(r: Race): Promise<Race>;
  deleteRace(id: string): Promise<void>;
  savePlanned(sessions: PlannedSession[]): Promise<PlannedSession[]>;
  deletePlanned(ids: string[]): Promise<void>;
  saveCheckin(c: CheckIn): Promise<void>;
  saveFunctionalLog(l: FunctionalLog): Promise<void>;
  deleteFunctionalLog(date: string): Promise<void>;
  /** séries temporais e voltas (Supabase: descarrega o FIT da Garmin na 1.ª vez) */
  getStreams(a: Activity, refresh?: boolean): Promise<ActivityStreams | null>;
  savePushSubscription(sub: PushSubscriptionInput): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  sendTestNotification(): Promise<void>;
  /** chave pública VAPID do servidor (só modo supabase) */
  vapidPublicKey?(): Promise<string>;
  listDashboards(): Promise<Dashboard[]>;
  saveDashboard(d: Dashboard): Promise<Dashboard>;
  deleteDashboard(id: string): Promise<void>;
  listAnalyses(): Promise<SavedAnalysis[]>;
  saveAnalysis(a: SavedAnalysis): Promise<SavedAnalysis>;
  deleteAnalysis(id: string): Promise<void>;
  suggestionStatuses(): Promise<Record<string, SuggestionStatus>>;
  setSuggestionStatus(s: Suggestion, status: SuggestionStatus): Promise<void>;
  garminStatus(): Promise<GarminConnection>;
  garminSaveKey(apiKey: string, expiresAt: string | null): Promise<void>;
  garminSync(): Promise<{ total: number; errors: string[] }>;
  garminBackfillStep(): Promise<BackfillStep>;
  /** dias de descanso de uma semana (null = voltar aos habituais) */
  saveWeekRestDays(weekStart: string, restDays: number[] | null): Promise<void>;
  /** calendário externo (.ics) onde o treinador ou outras aplicações põem os treinos */
  calendarStatus(): Promise<CalendarFeed | null>;
  calendarConnect(url: string, provider: string): Promise<{ imported: number }>;
  calendarSync(): Promise<{ imported: number }>;
  calendarRemove(): Promise<void>;
}

const toNext = (races: Race[]): NextRace | null => { const r = findNextRace(races, todayISO()); return r ? { date: r.date, name: r.name, priority: r.priority } : null; };

/** Plano demo: semanas anterior(es), atual e seguinte geradas a partir da periodização. */
function demoPlan(acts: Activity[], races: Race[], profile: AthleteProfile, today = todayISO()): PlannedSession[] {
  const first = addDays(startOfWeek(today), -21);
  const last = addDays(startOfWeek(today), 7);
  const load = loadSeries(acts, profile, addDays(first, -1), today);
  const segs = buildSeason(races, addDays(today, -400), addDays(today, 400));
  const out: PlannedSession[] = [];
  for (let ws = first; ws <= last; ws = addDays(ws, 7)) {
    const ctl = (load.find((l) => l.date === addDays(ws, -1)) ?? load.at(-1)!).ctl;
    const raceDates = races.filter((r) => r.date >= ws && r.date <= addDays(ws, 6)).map((r) => r.date);
    out.push(...generateWeek(weekTarget(segs, races, ws, ctl), profile, raceDates, profile.restDays ?? []).map((s, i) => ({ ...s, id: `plan-${s.date}-${i}` })));
  }
  return out;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// ───────────── Demo (localStorage) ─────────────

const LS = "tricoach.demo.";
function lsGet<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(LS + k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function lsSet(k: string, v: unknown) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }

export function demoStore(): Store {
  let cache: CoreData | null = null;
  return {
    mode: "demo",
    async loadCore() {
      if (cache) return cache;
      const stored = lsGet<Partial<AthleteProfile>>("profile", {});
      // no modo demo o atleta tem já duas zonas problemáticas, para mostrar as sugestões funcionais
      const profile = { ...DEFAULT_PROFILE, functionalAreas: ["achilles", "hamstrings"], ...stored, weights: { ...DEFAULT_PROFILE.weights, ...(stored.weights ?? {}) } };
      const d = generateDemo(DEFAULT_PROFILE);
      const races = lsGet<Race[] | null>("races", null) ?? demoRaces(d.activities);
      lsSet("races", races);
      let planned = lsGet<PlannedSession[] | null>("planned", null);
      if (!planned) { planned = profile.planSource === "coach" ? [] : demoPlan(d.activities, races, profile); lsSet("planned", planned); }
      const weekSettings = lsGet<WeekSetting[]>("weeks", []);
      const checkins = lsGet<CheckIn[] | null>("checkins", null) ?? demoCheckins();
      lsSet("checkins", checkins);
      const functionalLog = lsGet<FunctionalLog[] | null>("functional", null) ?? [
        { date: addDays(todayISO(), -6), mode: "full", minutes: 27, exercises: ["heel_drop_straight", "sl_rdl"], areas: ["achilles", "hamstrings"] },
        { date: addDays(todayISO(), -3), mode: "full", minutes: 25, exercises: ["calf_iso", "bridge_walkout"], areas: ["achilles", "hamstrings"] },
      ] as FunctionalLog[];
      lsSet("functional", functionalLog);
      cache = { activities: d.activities, wellness: d.wellness, profile, races, planned, checkins, functionalLog, weekSettings, nextRace: toNext(races) };
      return cache;
    },
    async saveProfile(p) { lsSet("profile", p); if (cache) cache = { ...cache, profile: p }; },
    async saveRace(r) {
      const v = { ...r, id: r.id || uid() };
      const xs = lsGet<Race[]>("races", []).filter((x) => x.id !== v.id).concat(v).sort((a, b) => (a.date < b.date ? -1 : 1));
      lsSet("races", xs); if (cache) cache = { ...cache, races: xs, nextRace: toNext(xs) };
      return v;
    },
    async deleteRace(id) { const xs = lsGet<Race[]>("races", []).filter((x) => x.id !== id); lsSet("races", xs); if (cache) cache = { ...cache, races: xs, nextRace: toNext(xs) }; },
    async savePlanned(sessions) {
      const prev = lsGet<PlannedSession[]>("planned", []);
      const byExt = new Map(prev.filter((x) => x.externalId).map((x) => [x.externalId!, x.id]));
      const vs = sessions.map((x) => ({ ...x, id: x.id || (x.externalId && byExt.get(x.externalId)) || uid() }));
      const ids = new Set(vs.map((x) => x.id));
      const xs = prev.filter((x) => !ids.has(x.id)).concat(vs);
      lsSet("planned", xs); if (cache) cache = { ...cache, planned: xs };
      return vs;
    },
    async deletePlanned(ids) { const set = new Set(ids); const xs = lsGet<PlannedSession[]>("planned", []).filter((x) => !set.has(x.id)); lsSet("planned", xs); if (cache) cache = { ...cache, planned: xs }; },
    async saveCheckin(c) { const xs = lsGet<CheckIn[]>("checkins", []).filter((x) => x.date !== c.date).concat(c); lsSet("checkins", xs); if (cache) cache = { ...cache, checkins: xs }; },
    async saveFunctionalLog(l) { const xs = lsGet<FunctionalLog[]>("functional", []).filter((x) => x.date !== l.date).concat(l); lsSet("functional", xs); if (cache) cache = { ...cache, functionalLog: xs }; },
    async deleteFunctionalLog(date) { const xs = lsGet<FunctionalLog[]>("functional", []).filter((x) => x.date !== date); lsSet("functional", xs); if (cache) cache = { ...cache, functionalLog: xs }; },
    async getStreams(a) { return demoStreams(a, cache?.profile ?? DEFAULT_PROFILE); },
    async savePushSubscription() { /* modo demo: só notificações locais */ },
    async saveWeekRestDays(weekStart, restDays) {
      const xs = lsGet<WeekSetting[]>("weeks", []).filter((w) => w.weekStart !== weekStart).concat(restDays ? [{ weekStart, restDays }] : []);
      lsSet("weeks", xs); if (cache) cache = { ...cache, weekSettings: xs };
    },
    async calendarStatus() { return null; },
    async calendarConnect() { throw new Error("A ligação ao calendário precisa de uma conta (não funciona no modo demo)."); },
    async calendarSync() { return { imported: 0 }; },
    async calendarRemove() { /* modo demo */ },
    async deletePushSubscription() { /* modo demo */ },
    async sendTestNotification() {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) throw new Error("Service worker indisponível neste browser");
      await reg.showNotification("TriCoach · Hoje", { body: "Prontidão 39 · Descanso ou recuperação ativa. HRV abaixo da banda normal.", icon: "/icon.svg", tag: "tricoach-test" });
    },
    async listDashboards() {
      const ds = lsGet<Dashboard[] | null>("dashboards", null);
      if (ds && ds.length) return ds;
      const def = defaultDashboards();
      lsSet("dashboards", def);
      return def;
    },
    async saveDashboard(d) {
      let ds = lsGet<Dashboard[]>("dashboards", defaultDashboards());
      if (d.isDefault) ds = ds.map((x) => ({ ...x, isDefault: false }));
      const i = ds.findIndex((x) => x.id === d.id);
      if (i >= 0) ds[i] = d; else ds.push(d);
      lsSet("dashboards", ds);
      return d;
    },
    async deleteDashboard(id) { lsSet("dashboards", lsGet<Dashboard[]>("dashboards", []).filter((x) => x.id !== id)); },
    async listAnalyses() { return lsGet<SavedAnalysis[]>("analyses", []); },
    async saveAnalysis(a) {
      const xs = lsGet<SavedAnalysis[]>("analyses", []);
      const v = { ...a, id: a.id || uid() };
      const i = xs.findIndex((x) => x.id === v.id);
      if (i >= 0) xs[i] = v; else xs.push(v);
      lsSet("analyses", xs);
      return v;
    },
    async deleteAnalysis(id) { lsSet("analyses", lsGet<SavedAnalysis[]>("analyses", []).filter((x) => x.id !== id)); },
    async suggestionStatuses() { return lsGet<Record<string, SuggestionStatus>>("suggestions", {}); },
    async setSuggestionStatus(s, status) { const m = lsGet<Record<string, SuggestionStatus>>("suggestions", {}); m[s.id] = status; lsSet("suggestions", m); },
    async garminStatus() { return { status: "not_connected" }; },
    async garminSaveKey() { throw new Error("No modo demo não há ligação à Garmin. Configure o Supabase (ver README)."); },
    async garminSync() { return { total: 0, errors: [] }; },
    async garminBackfillStep() { return { done: true, progress: 1 }; },
  };
}

// ───────────── Supabase ─────────────

async function userId(): Promise<string> {
  const { data } = await supabase!.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

async function fetchAll<T>(table: string, order: string, select = "*"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select(select).order(order, { ascending: false }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Traduz o erro genérico do supabase-js ("non-2xx status code") na mensagem real da função. */
export async function functionError(error: any, fn: string): Promise<Error> {
  const res: Response | undefined = error?.context instanceof Response ? error.context : undefined;
  if (!res) {
    // FunctionsFetchError / FunctionsRelayError: a função nem chegou a responder
    return new Error(`A função ${fn} não respondeu. Confirme que as Edge Functions estão a correr (npx supabase functions serve). Detalhe: ${error?.message ?? error}`);
  }
  let detail = "";
  try {
    const text = await res.clone().text();
    try {
      const j = JSON.parse(text);
      detail = j.error ?? j.msg ?? j.message ?? text;
    } catch { detail = text; }
  } catch { /* corpo ilegível */ }
  detail = String(detail || "").slice(0, 400);
  const hint =
    res.status === 404 ? " — a função não está publicada/servida." :
    res.status === 502 || res.status === 503 ? " — o servidor das Edge Functions não está a correr ou falhou a arrancar (veja supabase/functions.log)." :
    res.status === 401 ? " — sessão expirada: saia e volte a entrar." : "";
  return new Error(`${fn} (${res.status})${detail ? `: ${detail}` : ""}${hint}`);
}

async function invoke<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.functions.invoke("garmin-sync", { body: { action, ...extra } });
  if (error) throw await functionError(error, "garmin-sync");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

function plannedFromRow(x: any): PlannedSession {
  return { id: x.id, date: x.day, sport: x.sport, type: x.session_type, durationMin: x.duration_min, tss: x.tss == null ? null : Number(x.tss), title: x.title, description: x.description, steps: x.steps, source: x.source ?? "app", externalId: x.external_id ?? null };
}

export function supabaseStore(): Store {
  const sb = supabase!;
  return {
    mode: "supabase",
    async loadCore() {
      const [acts, well, prof, racesQ, plannedQ, checkQ, funcQ, weeksQ] = await Promise.all([
        fetchAll<any>("activities", "start_time", "id,garmin_id,start_time,activity_date,sport,sub_sport,name,duration_s,distance_m,elevation_m,avg_hr,max_hr,avg_power,norm_power,calories,tss,zone_seconds,gear,session_type,bests"),
        fetchAll<any>("daily_wellness", "day", "day,sleep_s,sleep_score,deep_s,rem_s,light_s,awake_s,hrv,rhr,stress_avg,bb_morning,steps,hydration_ml"),
        sb.from("athlete_profile").select("*").maybeSingle(),
        sb.from("races").select("*").order("race_date"),
        fetchAll<any>("planned_sessions", "day"),
        sb.from("checkins").select("*").gte("day", addDays(todayISO(), -400)),
        sb.from("functional_log").select("*").gte("day", addDays(todayISO(), -400)),
        sb.from("week_settings").select("week_start, rest_days").gte("week_start", addDays(todayISO(), -120)),
      ]);
      const races: Race[] = (racesQ.data ?? []).map((r: any) => ({ id: r.id, date: r.race_date, name: r.name, sport: r.sport ?? "triathlon", distance: r.distance, priority: r.priority, goalTimeS: r.goal_time_s, resultTimeS: r.result_time_s, location: r.location, notes: r.notes }));
      const r = prof.data;
      const profile: AthleteProfile = r ? {
        name: r.name, ftp: r.ftp, runThresholdPace: r.run_threshold_pace, css: r.css, hrMax: r.hr_max, lthr: r.lthr,
        weight: Number(r.weight), sleepTargetH: Number(r.sleep_target_h), seasonStartMonth: r.season_start_month,
        weights: { ...DEFAULT_PROFILE.weights, ...(r.readiness_weights ?? {}) },
        notifyEnabled: !!r.notify_enabled, notifyHour: r.notify_hour ?? 7, timezone: r.timezone ?? "Europe/Lisbon",
        functionalAreas: r.functional_areas ?? [], functionalLevel: r.functional_level ?? "intermediate", functionalEquipment: r.functional_equipment ?? ["band", "step"],
        planSource: r.plan_source === "coach" ? "coach" : "app",
        restDays: r.rest_days ?? [],
        onboardedAt: r.onboarded_at ?? null,
      } : DEFAULT_PROFILE;
      return {
        profile,
        races,
        nextRace: toNext(races),
        planned: plannedQ.map(plannedFromRow),
        weekSettings: (weeksQ.data ?? []).map((w: any) => ({ weekStart: w.week_start, restDays: w.rest_days ?? [] })),
        checkins: (checkQ.data ?? []).map((c: any) => ({ date: c.day, energy: c.energy, soreness: c.soreness, mood: c.mood, motivation: c.motivation, notes: c.notes })),
        functionalLog: (funcQ.data ?? []).map((f: any) => ({ date: f.day, mode: f.mode, minutes: f.minutes, exercises: f.exercises ?? [], areas: f.areas ?? [] })),
        activities: acts.map((a) => ({
          id: a.id, garminId: a.garmin_id, start: a.start_time, date: a.activity_date, sport: a.sport, subSport: a.sub_sport, name: a.name,
          durationS: a.duration_s, distanceM: Number(a.distance_m), elevationM: Number(a.elevation_m), avgHr: a.avg_hr, maxHr: a.max_hr,
          avgPower: a.avg_power, normPower: a.norm_power, calories: a.calories, tss: a.tss == null ? null : Number(a.tss),
          zoneSeconds: a.zone_seconds, gear: a.gear, sessionType: a.session_type, bests: a.bests,
        })),
        wellness: well.map((w) => ({
          date: w.day, sleepS: w.sleep_s, sleepScore: w.sleep_score, deepS: w.deep_s, remS: w.rem_s, lightS: w.light_s, awakeS: w.awake_s,
          hrv: w.hrv == null ? null : Number(w.hrv), rhr: w.rhr, stressAvg: w.stress_avg, bbMorning: w.bb_morning, steps: w.steps, hydrationMl: w.hydration_ml,
        })).sort((a, b) => (a.date < b.date ? -1 : 1)),
      };
    },
    async saveProfile(p) {
      const { error } = await sb.from("athlete_profile").upsert({
        user_id: await userId(), name: p.name, ftp: p.ftp, run_threshold_pace: p.runThresholdPace, css: p.css, hr_max: p.hrMax, lthr: p.lthr,
        weight: p.weight, sleep_target_h: p.sleepTargetH, season_start_month: p.seasonStartMonth, readiness_weights: p.weights,
        notify_enabled: p.notifyEnabled, notify_hour: p.notifyHour, timezone: p.timezone,
        functional_areas: p.functionalAreas, functional_level: p.functionalLevel, functional_equipment: p.functionalEquipment,
        plan_source: p.planSource, rest_days: p.restDays,
        onboarded_at: p.onboardedAt ?? null, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async saveRace(r) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(r.id);
      const { data, error } = await sb.from("races").upsert({ ...(isUuid ? { id: r.id } : {}), user_id: await userId(), race_date: r.date, name: r.name, sport: raceSportOf(r), distance: r.distance, priority: r.priority,
        goal_time_s: r.goalTimeS ?? null, result_time_s: r.resultTimeS ?? null, location: r.location ?? null, notes: r.notes ?? null }).select().single();
      if (error) throw error;
      return { ...r, id: data.id };
    },
    async deleteRace(id) { const { error } = await sb.from("races").delete().eq("id", id); if (error) throw error; },
    async savePlanned(sessions) {
      const user_id = await userId();
      const row = (x: PlannedSession) => ({ user_id, day: x.date, sport: x.sport, session_type: x.type, duration_min: x.durationMin, tss: x.tss ?? null, title: x.title, description: x.description ?? null, steps: x.steps ?? null, source: x.source ?? "manual", external_id: x.externalId ?? null });
      // novas e existentes em pedidos separados (o upsert em lote precisa das mesmas colunas em todas as linhas)
      const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
      const out: PlannedSession[] = [];
      const existing = sessions.filter((x) => isId(x.id)).map((x) => ({ id: x.id, ...row(x) }));
      const fresh = sessions.filter((x) => !isId(x.id) && !x.externalId).map(row);
      // vindas de um calendário: atualizam a sessão com o mesmo UID em vez de a repetir
      const external = sessions.filter((x) => !isId(x.id) && x.externalId).map(row);
      for (const [batch, opts] of [[existing, {}], [fresh, {}], [external, { onConflict: "user_id,external_id" }]] as const) {
        for (let i = 0; i < batch.length; i += 200) {
          const { data, error } = await sb.from("planned_sessions").upsert(batch.slice(i, i + 200) as any[], opts).select();
          if (error) throw error;
          out.push(...(data ?? []).map(plannedFromRow));
        }
      }
      return out;
    },
    async deletePlanned(ids) { if (!ids.length) return; const { error } = await sb.from("planned_sessions").delete().in("id", ids); if (error) throw error; },
    async saveCheckin(c) {
      const { error } = await sb.from("checkins").upsert({ user_id: await userId(), day: c.date, energy: c.energy, soreness: c.soreness, mood: c.mood, motivation: c.motivation, notes: c.notes ?? null, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async saveFunctionalLog(l) {
      const { error } = await sb.from("functional_log").upsert({ user_id: await userId(), day: l.date, mode: l.mode, minutes: l.minutes, exercises: l.exercises, areas: l.areas, done_at: new Date().toISOString() });
      if (error) throw error;
    },
    async deleteFunctionalLog(date) { const { error } = await sb.from("functional_log").delete().eq("day", date); if (error) throw error; },
    async getStreams(a, refresh) {
      const { data, error } = await sb.functions.invoke("garmin-activity", { body: { activityId: a.id, refresh: !!refresh } });
      if (error) throw await functionError(error, "garmin-activity");
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      return { activityId: a.id, sampleS: d.sample_s, ...d.streams, laps: d.laps };
    },
    async savePushSubscription(sub) {
      const { error } = await sb.from("push_subscriptions").upsert({ user_id: await userId(), endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" });
      if (error) throw error;
    },
    async deletePushSubscription(endpoint) { await sb.from("push_subscriptions").delete().eq("endpoint", endpoint); },
    async saveWeekRestDays(weekStart, restDays) {
      const user_id = await userId();
      const { error } = restDays
        ? await sb.from("week_settings").upsert({ user_id, week_start: weekStart, rest_days: restDays, updated_at: new Date().toISOString() })
        : await sb.from("week_settings").delete().eq("week_start", weekStart);
      if (error) throw error;
    },
    async calendarStatus() {
      const { data, error } = await sb.from("calendar_feed").select("*").maybeSingle();
      if (error) throw error;
      return data ? { provider: data.provider, status: data.status, lastSyncAt: data.last_sync_at, lastError: data.last_error, events: data.events } : null;
    },
    async calendarConnect(url, provider) {
      const { data, error } = await sb.functions.invoke("calendar-sync", { body: { action: "save-url", url, provider } });
      if (error) throw await functionError(error, "calendar-sync");
      return { imported: Number((data as any)?.imported ?? 0) };
    },
    async calendarSync() {
      const { data, error } = await sb.functions.invoke("calendar-sync", { body: { action: "sync" } });
      if (error) throw await functionError(error, "calendar-sync");
      return { imported: Number((data as any)?.imported ?? 0) };
    },
    async calendarRemove() {
      const { error } = await sb.functions.invoke("calendar-sync", { body: { action: "remove" } });
      if (error) throw await functionError(error, "calendar-sync");
    },
    async vapidPublicKey() {
      const { data, error } = await sb.functions.invoke("notify", { body: { action: "public-key" } });
      if (error) throw await functionError(error, "notify");
      return String((data as any)?.publicKey ?? "");
    },
    async sendTestNotification() {
      const { data, error } = await sb.functions.invoke("notify", { body: { action: "test" } });
      if (error) throw await functionError(error, "notify");
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    async listDashboards() {
      const { data, error } = await sb.from("dashboards").select("*").order("position");
      if (error) throw error;
      if (!data?.length) {
        const defs = defaultDashboards();
        for (const d of defs) await this.saveDashboard(d);
        return this.listDashboards();
      }
      return data.map((d: any) => ({ id: d.id, name: d.name, isDefault: d.is_default, widgets: d.widgets, layouts: d.layouts }));
    },
    async saveDashboard(d) {
      const user_id = await userId();
      if (d.isDefault) await sb.from("dashboards").update({ is_default: false }).eq("user_id", user_id).neq("id", d.id);
      const isUuid = /^[0-9a-f-]{36}$/i.test(d.id);
      const row = { ...(isUuid ? { id: d.id } : {}), user_id, name: d.name, is_default: d.isDefault, widgets: d.widgets, layouts: d.layouts, updated_at: new Date().toISOString() };
      const { data, error } = await sb.from("dashboards").upsert(row).select().single();
      if (error) throw error;
      return { ...d, id: data.id };
    },
    async deleteDashboard(id) { const { error } = await sb.from("dashboards").delete().eq("id", id); if (error) throw error; },
    async listAnalyses() {
      const { data, error } = await sb.from("saved_analyses").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []).map((a: any) => ({ id: a.id, name: a.name, query: a.query, chart: a.chart }));
    },
    async saveAnalysis(a) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(a.id);
      const { data, error } = await sb.from("saved_analyses").upsert({ ...(isUuid ? { id: a.id } : {}), user_id: await userId(), name: a.name, query: a.query, chart: a.chart }).select().single();
      if (error) throw error;
      return { ...a, id: data.id };
    },
    async deleteAnalysis(id) { const { error } = await sb.from("saved_analyses").delete().eq("id", id); if (error) throw error; },
    async suggestionStatuses() {
      const { data } = await sb.from("suggestions").select("id,status");
      return Object.fromEntries((data ?? []).map((s: any) => [s.id, s.status]));
    },
    async setSuggestionStatus(s, status) {
      const { error } = await sb.from("suggestions").upsert({
        id: s.id, user_id: await userId(), day: s.date, rule: s.rule, severity: s.severity, title: s.title, action: s.action,
        reason: s.reason, confidence: s.confidence, data: s.data ?? null, status, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async garminStatus() {
      const { data } = await sb.from("garmin_connection").select("*").maybeSingle();
      if (!data) return { status: "not_connected" };
      return {
        status: data.status, keyExpiresAt: data.key_expires_at, lastSyncAt: data.last_sync_at, backfillFrom: data.backfill_from,
        backfillCursor: data.backfill_cursor, backfillDone: data.backfill_done, lastError: data.last_error,
      };
    },
    async garminSaveKey(apiKey, expiresAt) { await invoke("save-key", { apiKey, expiresAt }); },
    async garminSync() { return invoke("sync"); },
    async garminBackfillStep() { return invoke("backfill-step"); },
  };
}
