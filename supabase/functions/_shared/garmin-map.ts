// Mapeamento das respostas da Garmin Connect Personal API (OpenAPI 3.0.1, v1.0.0) para as tabelas do TriCoach.
// Módulo puro (sem APIs Deno) para ser testado com Vitest.
// Fonte: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/

/** Tipos de dados que a sincronização importa. */
export type DataType = "activities" | "dailySummaries" | "sleep" | "hrv";

export interface EndpointDef {
  /** Caminho; {from}/{to} são substituídos quando a data vai no caminho */
  path: string;
  /** Parâmetros de query com as datas (quando não vão no caminho) */
  query?: { from: string; to: string };
  /** Janela máxima por pedido, em dias (documentada no Swagger, ou conservadora quando não é indicada) */
  maxDays: number;
  /** Como extrair a lista de itens da resposta */
  unwrap: (body: any) => any[];
}

export const ENDPOINTS: Record<DataType, EndpointDef> = {
  // SummarizedActivityDTO[] · paginado (start/limit, limite por defeito 99)
  activities: {
    path: "/activitylist-service/activities/search/activities",
    query: { from: "startDate", to: "endDate" },
    maxDays: 31, // sem limite documentado; janelas curtas mantêm poucas páginas
    unwrap: (b) => (Array.isArray(b) ? b : []),
  },
  // ApiDocumentListUserDailySummaryV2DTO { data: UserDailySummaryV2DTO[] } · até 1 ano
  dailySummaries: {
    path: "/usersummary-service/v2/dailysummaries",
    query: { from: "startDate", to: "endDate" },
    maxDays: 365,
    unwrap: (b) => (Array.isArray(b?.data) ? b.data : []),
  },
  // DailySleepDTO[] · até 31 dias
  sleep: {
    path: "/sleep-service/sleep/dailySleepSummariesByDate",
    query: { from: "startDate", to: "endDate" },
    maxDays: 31,
    unwrap: (b) => (Array.isArray(b) ? b : []),
  },
  // HrvDailySummaryDTO { hrvSummaries: HrvSummaryDTO[] } · limite não documentado → 28 dias
  hrv: {
    path: "/hrv-service/hrv/daily/{from}/{to}",
    maxDays: 28,
    unwrap: (b) => (Array.isArray(b?.hrvSummaries) ? b.hrvSummaries : []),
  },
};

export const ACTIVITY_PAGE_SIZE = 100;

export function buildUrl(base: string, type: DataType, from: string, to: string, extra: Record<string, string | number | boolean> = {}): string {
  const ep = ENDPOINTS[type];
  const url = new URL(base + ep.path.replace("{from}", from).replace("{to}", to));
  if (ep.query) { url.searchParams.set(ep.query.from, from); url.searchParams.set(ep.query.to, to); }
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  return url.toString();
}

/** Divide [from, to] em janelas de no máximo `maxDays`. */
export function windows(from: string, to: string, maxDays: number): [string, string][] {
  const out: [string, string][] = [];
  let a = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (a <= end) {
    const b = new Date(a); b.setUTCDate(b.getUTCDate() + maxDays - 1);
    const bb = b > end ? end : b;
    out.push([a.toISOString().slice(0, 10), bb.toISOString().slice(0, 10)]);
    a = new Date(bb); a.setUTCDate(a.getUTCDate() + 1);
  }
  return out;
}

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const int = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.round(n); };

// ───────────── Atividades ─────────────

/** ActivityTypeDTO.typeKey → modalidade e subtipo do TriCoach. */
export function mapSport(typeKey: string | null | undefined): { sport: string; sub: string } {
  const t = (typeKey ?? "").toLowerCase();
  if (t.includes("open_water")) return { sport: "swim", sub: "open_water" };
  if (t.includes("swim")) return { sport: "swim", sub: "pool" };
  if (t === "multi_sport" || t.includes("triathlon") || t.includes("duathlon")) return { sport: "brick", sub: "race" };
  if (t.includes("transition")) return { sport: "other", sub: "transition" };
  if (t.includes("indoor_cycling") || t.includes("virtual_ride")) return { sport: "bike", sub: "indoor" };
  if (t.includes("mountain") || t.includes("gravel")) return { sport: "bike", sub: "mtb" };
  if (t.includes("cycl") || t.includes("biking") || t.includes("ride")) return { sport: "bike", sub: "road" };
  if (t.includes("treadmill")) return { sport: "run", sub: "treadmill" };
  if (t.includes("trail")) return { sport: "run", sub: "trail" };
  if (t.includes("track")) return { sport: "run", sub: "track" };
  if (t.includes("run")) return { sport: "run", sub: "road" };
  if (t.includes("strength") || t.includes("fitness_equipment") || t.includes("hiit")) return { sport: "strength", sub: "gym" };
  return { sport: "other", sub: "generic" };
}

/** "yyyy-MM-dd HH:mm:ss" (GMT) → ISO 8601 UTC */
function gmtToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** SummarizedActivityDTO → linha de `activities`. */
export function mapActivity(a: any, userId: string, parent?: any) {
  const { sport, sub } = mapSport(a?.activityType?.typeKey);
  const isRace = a?.eventType?.typeKey === "race" || parent?.eventType?.typeKey === "race";
  const zones = [1, 2, 3, 4, 5].map((z) => num(a?.[`hrTimeInZone_${z}`]) ?? 0);
  const startLocal: string = a?.startTimeLocal ?? "";
  return {
    user_id: userId,
    garmin_id: String(a.activityId),
    start_time: gmtToIso(a?.startTimeGMT) ?? (a?.beginTimestamp ? new Date(a.beginTimestamp).toISOString() : new Date().toISOString()),
    activity_date: /^\d{4}-\d{2}-\d{2}/.test(startLocal) ? startLocal.slice(0, 10) : (gmtToIso(a?.startTimeGMT) ?? "").slice(0, 10),
    sport,
    sub_sport: sub,
    name: parent?.activityName ? `${parent.activityName} · ${a?.activityName ?? ""}`.trim() : (a?.activityName ?? ""),
    duration_s: int(a?.duration) ?? 0,
    distance_m: num(a?.distance) ?? 0,
    elevation_m: num(a?.elevationGain) ?? 0,
    avg_hr: int(a?.averageHR),
    max_hr: int(a?.maxHR),
    avg_power: int(a?.avgPower),
    norm_power: int(a?.normPower),
    calories: int(a?.calories),
    tss: num(a?.trainingStressScore),
    zone_seconds: zones.some((z) => z > 0) ? zones.map((z) => Math.round(z)) : null,
    gear: null,
    session_type: isRace ? "race" : null,
    bests: extractBests(a),
    raw: a,
  };
}

/** Campos de melhores marcas do SummarizedActivityDTO: fastestSplit_<m> (s) e maxAvgPower_<s> (W). */
export function extractBests(a: any): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a ?? {})) {
    if (!/^(fastestSplit_\d+|maxAvgPower_\d+)$/.test(k)) continue;
    const n = num(v);
    if (n != null && n > 0) out[k] = +n.toFixed(2);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Prepara as atividades de uma janela.
 * Pede-se com excludeChildren=false: num multidesporto (triatlo/brick) a atividade-mãe repete os totais das pernas.
 * Para as estatísticas por modalidade contam as pernas (natação, ciclismo, corrida); a mãe é descartada e
 * o seu nome e tipo de evento (prova) passam para as pernas.
 */
export function prepareActivities(items: any[], userId: string) {
  const byId = new Map(items.map((a) => [String(a.activityId), a]));
  const parentsWithChildren = new Set(items.filter((a) => a?.parentId && byId.has(String(a.parentId))).map((a) => String(a.parentId)));
  const seen = new Set<string>();
  return items
    .filter((a) => a?.activityId != null && !seen.has(String(a.activityId)) && (seen.add(String(a.activityId)), true))
    .filter((a) => !(a.isParent || a.parent) || !parentsWithChildren.has(String(a.activityId)))
    .map((a) => mapActivity(a, userId, a?.parentId ? byId.get(String(a.parentId)) : undefined));
}

// ───────────── Saúde diária ─────────────

export type WellnessPatch = Record<string, Record<string, any>>;

/** Converte itens de um tipo de saúde em patches por dia (colunas de `daily_wellness`). */
export function mapWellness(type: Exclude<DataType, "activities">, items: any[]): WellnessPatch {
  const out: WellnessPatch = {};
  for (const it of items) {
    const day = String(it?.calendarDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const p: Record<string, any> = {};
    if (type === "dailySummaries") {
      // UserDailySummaryV2DTO
      p.rhr = int(it?.heartRate?.restingValue);
      p.stress_avg = int(it?.stress?.avgLevel);
      // Body Battery "ao acordar": a v2 não o expõe; o máximo do dia é normalmente atingido ao acordar.
      p.bb_morning = int(it?.bodyBattery?.maxValue);
      p.steps = int(it?.movement?.steps?.value);
      p.hydration_ml = int(it?.hydration?.consumedInFractionalMl);
    } else if (type === "sleep") {
      // DailySleepDTO
      p.sleep_s = int(it?.sleepTimeSeconds);
      p.sleep_score = int(it?.sleepScores?.overall?.value);
      p.deep_s = int(it?.deepSleepSeconds);
      p.light_s = int(it?.lightSleepSeconds);
      p.rem_s = int(it?.remSleepSeconds);
      p.awake_s = int(it?.awakeSleepSeconds);
      if (!p.sleep_s) continue; // dia sem sono medido
    } else if (type === "hrv") {
      // HrvSummaryDTO
      p.hrv = num(it?.lastNightAvg);
    }
    for (const k of Object.keys(p)) if (p[k] == null) delete p[k];
    p.raw = { [type]: it };
    out[day] = { ...(out[day] ?? {}), ...p };
  }
  return out;
}

// ───────────── Token ─────────────

/**
 * Interpreta a resposta de POST .../personal-api-key/token.
 * O Swagger não documenta o formato: aceita JSON ({access_token|accessToken|token, expires_in|expiresIn}),
 * uma string JSON ou o token em texto simples. Se o token for um JWT, a expiração vem do campo `exp`.
 */
export function parseTokenResponse(body: string, now = Date.now()): { token: string; expiresAt: string } {
  const text = body.trim();
  let token: string | null = null;
  let ttl: number | null = null;
  try {
    const j = JSON.parse(text);
    if (typeof j === "string") token = j;
    else if (j && typeof j === "object") {
      token = j.access_token ?? j.accessToken ?? j.token ?? j.personalApiToken ?? null;
      const e = Number(j.expires_in ?? j.expiresIn ?? NaN);
      if (Number.isFinite(e) && e > 0) ttl = e;
    }
  } catch {
    if (/^[A-Za-z0-9\-_.~+/=]+$/.test(text)) token = text;
  }
  if (!token) throw new Error(`Resposta de token não reconhecida: ${text.slice(0, 120)}`);
  if (ttl == null) {
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=")));
        if (typeof payload.exp === "number") return { token, expiresAt: new Date(payload.exp * 1000).toISOString() };
      } catch { /* não é JWT legível */ }
    }
  }
  return { token, expiresAt: new Date(now + (ttl ?? 86400) * 1000).toISOString() };
}

// ───────────── Ficheiro FIT de atividade → séries temporais ─────────────

export interface StreamsRow {
  sample_s: number;
  streams: { t: number[]; hr: (number | null)[]; power: (number | null)[]; speed: (number | null)[]; cadence: (number | null)[]; alt: (number | null)[]; dist: (number | null)[] };
  laps: { index: number; startS: number; durationS: number; distanceM: number; avgHr: number | null; avgPower: number | null; avgSpeed: number | null }[];
}

/**
 * Converte o resultado do fit-file-parser (mode "list", unidades m e m/s) em séries reamostradas a cada `sampleS` segundos
 * (média dos registos em cada intervalo) e em voltas.
 */
export function fitToStreams(parsed: any, sampleS = 5): StreamsRow {
  const recs: any[] = (parsed?.records ?? []).filter((r: any) => r?.timestamp);
  const ts = (r: any) => new Date(r.timestamp).getTime() / 1000;
  const t0 = recs.length ? ts(recs[0]) : 0;
  const buckets = new Map<number, any[]>();
  for (const r of recs) { const b = Math.floor((ts(r) - t0) / sampleS); (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(r); }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const mean = (rs: any[], ...fields: string[]) => {
    const v = rs.map((r) => { for (const f of fields) if (r[f] != null && Number.isFinite(Number(r[f]))) return Number(r[f]); return null; }).filter((x): x is number => x != null);
    return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2) : null;
  };
  const last = (rs: any[], f: string) => { for (let i = rs.length - 1; i >= 0; i--) if (rs[i][f] != null) return +Number(rs[i][f]).toFixed(1); return null; };
  const streams: StreamsRow["streams"] = { t: [], hr: [], power: [], speed: [], cadence: [], alt: [], dist: [] };
  for (const k of keys) {
    const rs = buckets.get(k)!;
    streams.t.push(k * sampleS);
    streams.hr.push(mean(rs, "heart_rate"));
    streams.power.push(mean(rs, "power"));
    streams.speed.push(mean(rs, "enhanced_speed", "speed"));
    streams.cadence.push(mean(rs, "cadence"));
    streams.alt.push(mean(rs, "enhanced_altitude", "altitude"));
    streams.dist.push(last(rs, "distance"));
  }
  // séries sem dados ficam vazias (poupa espaço)
  for (const k of ["hr", "power", "speed", "cadence", "alt", "dist"] as const) if (streams[k].every((x) => x == null)) streams[k] = [];
  const laps = (parsed?.laps ?? []).map((l: any, i: number) => ({
    index: i + 1,
    startS: l.start_time ? Math.max(0, Math.round(new Date(l.start_time).getTime() / 1000 - t0)) : 0,
    durationS: Math.round(num(l.total_timer_time) ?? num(l.total_elapsed_time) ?? 0),
    distanceM: Math.round(num(l.total_distance) ?? 0),
    avgHr: int(l.avg_heart_rate),
    avgPower: int(l.avg_power),
    avgSpeed: num(l.enhanced_avg_speed ?? l.avg_speed),
  }));
  return { sample_s: sampleS, streams, laps };
}
