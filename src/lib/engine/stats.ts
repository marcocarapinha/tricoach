import type { Activity, AthleteProfile, Wellness } from "../types";
import { SESSION_LABEL, SPORT_LABEL, SPORTS } from "../types";
import { MONTHS_PT, WEEKDAYS_PT, addDays, addYears, diffDays, isoWeek, month, todayISO, weekday, year, fmtPace, fmtDuration } from "../dates";
import { activityTss, dominantZone } from "./load";

// ───────────── Métricas ─────────────

export type Agg = "sum" | "avg" | "max" | "median";
export const AGG_LABEL: Record<Agg, string> = { sum: "Soma", avg: "Média", max: "Máximo / melhor", median: "Mediana" };

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  source: "activity" | "wellness";
  defaultAgg: Agg;
  /** valor por atividade/dia */
  value: (x: any, p: AthleteProfile) => number | null;
  /** métrica de taxa (ritmo, velocidade): a média é ponderada pelo tempo e calculada como total/total */
  rate?: { num: (a: Activity) => number; den: (a: Activity) => number; transform: (r: number) => number };
  higherIsBetter: boolean;
  /** para ritmo: "melhor" = menor */
  bestIsMin?: boolean;
  format: (v: number) => string;
  aggs: Agg[];
}

const n0 = (v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const METRICS: MetricDef[] = [
  { key: "distance", label: "Distância", unit: "km", source: "activity", defaultAgg: "sum", value: (a: Activity) => a.distanceM / 1000, higherIsBetter: true, format: n1, aggs: ["sum", "avg", "max", "median"] },
  { key: "duration", label: "Tempo", unit: "h", source: "activity", defaultAgg: "sum", value: (a: Activity) => a.durationS / 3600, higherIsBetter: true, format: (v) => fmtDuration(v * 3600), aggs: ["sum", "avg", "max", "median"] },
  { key: "sessions", label: "N.º sessões", unit: "", source: "activity", defaultAgg: "sum", value: () => 1, higherIsBetter: true, format: n0, aggs: ["sum"] },
  { key: "elevation", label: "Desnível", unit: "m", source: "activity", defaultAgg: "sum", value: (a: Activity) => a.elevationM, higherIsBetter: true, format: n0, aggs: ["sum", "avg", "max"] },
  { key: "tss", label: "Carga (TSS)", unit: "", source: "activity", defaultAgg: "sum", value: (a: Activity, p) => activityTss(a, p), higherIsBetter: true, format: n0, aggs: ["sum", "avg", "max", "median"] },
  { key: "calories", label: "Calorias", unit: "kcal", source: "activity", defaultAgg: "sum", value: (a: Activity) => a.calories ?? null, higherIsBetter: true, format: n0, aggs: ["sum", "avg"] },
  {
    key: "pace", label: "Ritmo médio (corrida)", unit: "min/km", source: "activity", defaultAgg: "avg",
    value: (a: Activity) => (a.sport === "run" && a.distanceM > 0 ? a.durationS / (a.distanceM / 1000) : null),
    rate: { num: (a) => (a.sport === "run" ? a.durationS : 0), den: (a) => (a.sport === "run" ? a.distanceM / 1000 : 0), transform: (r) => r },
    higherIsBetter: false, bestIsMin: true, format: fmtPace, aggs: ["avg", "max", "median"],
  },
  {
    key: "swimPace", label: "Ritmo médio (natação)", unit: "min/100m", source: "activity", defaultAgg: "avg",
    value: (a: Activity) => (a.sport === "swim" && a.distanceM > 0 ? a.durationS / (a.distanceM / 100) : null),
    rate: { num: (a) => (a.sport === "swim" ? a.durationS : 0), den: (a) => (a.sport === "swim" ? a.distanceM / 100 : 0), transform: (r) => r },
    higherIsBetter: false, bestIsMin: true, format: fmtPace, aggs: ["avg", "max", "median"],
  },
  {
    key: "speed", label: "Velocidade média (ciclismo)", unit: "km/h", source: "activity", defaultAgg: "avg",
    value: (a: Activity) => (a.sport === "bike" && a.durationS > 0 ? a.distanceM / 1000 / (a.durationS / 3600) : null),
    rate: { num: (a) => (a.sport === "bike" ? a.distanceM / 1000 : 0), den: (a) => (a.sport === "bike" ? a.durationS / 3600 : 0), transform: (r) => r },
    higherIsBetter: true, format: n1, aggs: ["avg", "max", "median"],
  },
  { key: "avgPower", label: "Potência média", unit: "W", source: "activity", defaultAgg: "avg", value: (a: Activity) => a.avgPower ?? null, higherIsBetter: true, format: n0, aggs: ["avg", "max", "median"] },
  { key: "normPower", label: "Potência normalizada", unit: "W", source: "activity", defaultAgg: "avg", value: (a: Activity) => a.normPower ?? null, higherIsBetter: true, format: n0, aggs: ["avg", "max", "median"] },
  { key: "avgHr", label: "FC média", unit: "bpm", source: "activity", defaultAgg: "avg", value: (a: Activity) => a.avgHr ?? null, higherIsBetter: false, format: n0, aggs: ["avg", "max", "median"] },
  { key: "z2time", label: "Tempo em Z1–Z2", unit: "h", source: "activity", defaultAgg: "sum", value: (a: Activity) => (a.zoneSeconds ? (a.zoneSeconds[0] + a.zoneSeconds[1]) / 3600 : null), higherIsBetter: true, format: (v) => fmtDuration(v * 3600), aggs: ["sum", "avg"] },
  { key: "z45time", label: "Tempo em Z4–Z5", unit: "h", source: "activity", defaultAgg: "sum", value: (a: Activity) => (a.zoneSeconds ? (a.zoneSeconds[3] + a.zoneSeconds[4]) / 3600 : null), higherIsBetter: true, format: (v) => fmtDuration(v * 3600), aggs: ["sum", "avg"] },
  { key: "hrv", label: "HRV médio", unit: "ms", source: "wellness", defaultAgg: "avg", value: (w: Wellness) => w.hrv ?? null, higherIsBetter: true, format: n0, aggs: ["avg", "max", "median"] },
  { key: "sleep", label: "Sono médio", unit: "h", source: "wellness", defaultAgg: "avg", value: (w: Wellness) => (w.sleepS != null ? w.sleepS / 3600 : null), higherIsBetter: true, format: (v) => fmtDuration(v * 3600), aggs: ["avg", "median", "sum"] },
  { key: "rhr", label: "FC repouso", unit: "bpm", source: "wellness", defaultAgg: "avg", value: (w: Wellness) => w.rhr ?? null, higherIsBetter: false, format: n0, aggs: ["avg", "median"] },
  { key: "stress", label: "Stress médio", unit: "", source: "wellness", defaultAgg: "avg", value: (w: Wellness) => w.stressAvg ?? null, higherIsBetter: false, format: n0, aggs: ["avg", "median"] },
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<string, MetricDef>;

// ───────────── Dimensões de agrupamento ─────────────

export interface DimDef {
  key: string;
  label: string;
  /** dimensão temporal: aplica-se também a dados de saúde e alinha entre anos */
  time: boolean;
  keyOf: (x: { date: string } & Partial<Activity>, p: AthleteProfile) => string;
  labelOf: (k: string) => string;
  sortOf: (k: string) => number | string;
}

const SUB_LABEL: Record<string, string> = {
  pool: "Piscina", open_water: "Águas abertas", road: "Estrada", indoor: "Rolo / indoor", mtb: "BTT",
  trail: "Trail", treadmill: "Passadeira", track: "Pista", race: "Prova", gym: "Ginásio", generic: "Geral",
};

export const DIMS: DimDef[] = [
  { key: "sport", label: "Modalidade", time: false, keyOf: (a) => a.sport ?? "other", labelOf: (k) => SPORT_LABEL[k as keyof typeof SPORT_LABEL] ?? k, sortOf: (k) => SPORTS.indexOf(k as any) },
  { key: "subSport", label: "Subtipo", time: false, keyOf: (a) => a.subSport ?? "generic", labelOf: (k) => SUB_LABEL[k] ?? k, sortOf: (k) => k },
  { key: "month", label: "Mês", time: true, keyOf: (a) => String(month(a.date)), labelOf: (k) => MONTHS_PT[Number(k) - 1], sortOf: (k) => Number(k) },
  { key: "quarter", label: "Trimestre", time: true, keyOf: (a) => String(Math.ceil(month(a.date) / 3)), labelOf: (k) => `T${k}`, sortOf: (k) => Number(k) },
  { key: "week", label: "Semana ISO", time: true, keyOf: (a) => String(isoWeek(a.date)), labelOf: (k) => `S${k}`, sortOf: (k) => Number(k) },
  { key: "weekday", label: "Dia da semana", time: true, keyOf: (a) => String(weekday(a.date)), labelOf: (k) => WEEKDAYS_PT[Number(k)], sortOf: (k) => Number(k) },
  { key: "zone", label: "Zona dominante", time: false, keyOf: (a, p) => String(dominantZone(a as Activity, p)), labelOf: (k) => `Z${k}`, sortOf: (k) => Number(k) },
  { key: "sessionType", label: "Tipo de sessão", time: false, keyOf: (a) => a.sessionType ?? "endurance", labelOf: (k) => SESSION_LABEL[k as keyof typeof SESSION_LABEL] ?? k, sortOf: (k) => k },
  { key: "gear", label: "Equipamento", time: false, keyOf: (a) => a.gear ?? "Sem equipamento", labelOf: (k) => k, sortOf: (k) => k },
];

export const DIM = Object.fromEntries(DIMS.map((d) => [d.key, d])) as Record<string, DimDef>;

// ───────────── Períodos ─────────────

export type PeriodKind = "ytd" | "year" | "month" | "quarter" | "season" | "last28" | "last90" | "custom";

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  ytd: "Ano até hoje (YTD)", year: "Ano completo", month: "Mês atual", quarter: "Trimestre atual",
  season: "Época", last28: "Últimos 28 dias", last90: "Últimos 90 dias", custom: "Intervalo livre",
};

export interface PeriodSpec { kind: PeriodKind; from?: string; to?: string; seasonStartMonth?: number; }

export interface Range { from: string; to: string; }

export function resolvePeriod(spec: PeriodSpec, today = todayISO()): Range {
  const y = year(today), m = month(today);
  const pad = (x: number) => String(x).padStart(2, "0");
  switch (spec.kind) {
    case "ytd": return { from: `${y}-01-01`, to: today };
    case "year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "month": return { from: `${y}-${pad(m)}-01`, to: today };
    case "quarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad(qm)}-01`, to: today }; }
    case "season": {
      const sm = spec.seasonStartMonth ?? 10;
      const sy = m >= sm ? y : y - 1;
      return { from: `${sy}-${pad(sm)}-01`, to: today };
    }
    case "last28": return { from: addDays(today, -27), to: today };
    case "last90": return { from: addDays(today, -89), to: today };
    case "custom": return { from: spec.from ?? addDays(today, -27), to: spec.to ?? today };
  }
}

/** Período homólogo: mesmo intervalo deslocado `k` anos (corta no mesmo dia do ano). */
export function shiftRange(r: Range, k: number): Range {
  return { from: addYears(r.from, -k), to: addYears(r.to, -k) };
}

export function rangeLabel(r: Range): string {
  if (year(r.from) === year(r.to)) return String(year(r.to));
  return `${year(r.from)}/${String(year(r.to)).slice(2)}`;
}

// ───────────── Agregação ─────────────

export interface StatsQuery {
  period: PeriodSpec;
  compare: number[]; // ex.: [1,2,3]
  groupBy: string[]; // até 2 dimensões
  metrics: string[];
  agg?: Record<string, Agg>;
  sports?: string[]; // filtro de modalidade (vazio = todas)
}

export interface Cell { [offset: number]: number | null }

export interface StatsRow {
  key: string;
  label: string;
  sort: number | string;
  values: Record<string, Cell>; // metric → offset → valor
  children?: StatsRow[];
}

export interface StatsResult {
  offsets: number[]; // [0, 1, 2, 3]
  ranges: Record<number, Range>;
  rows: StatsRow[];
  total: Record<string, Cell>;
  /** anos sem quaisquer dados no período (para mostrar "sem dados" em vez de 0) */
  empty: Record<number, boolean>;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

export function aggregate(items: any[], m: MetricDef, agg: Agg, p: AthleteProfile): number | null {
  if (m.rate && agg === "avg") {
    let num = 0, den = 0;
    for (const a of items) { num += m.rate.num(a); den += m.rate.den(a); }
    return den > 0 ? m.rate.transform(num / den) : null;
  }
  const vals = items.map((x) => m.value(x, p)).filter((v): v is number => v != null && isFinite(v));
  if (!vals.length) return agg === "sum" && m.key === "sessions" ? 0 : agg === "sum" && m.source === "activity" ? 0 : null;
  switch (agg) {
    case "sum": return vals.reduce((s, v) => s + v, 0);
    case "avg": return vals.reduce((s, v) => s + v, 0) / vals.length;
    case "max": return m.bestIsMin ? Math.min(...vals) : Math.max(...vals);
    case "median": return median(vals);
  }
}

export function runStats(acts: Activity[], wellness: Wellness[], q: StatsQuery, p: AthleteProfile, today = todayISO()): StatsResult {
  const base = resolvePeriod({ ...q.period, seasonStartMonth: q.period.seasonStartMonth ?? p.seasonStartMonth }, today);
  const offsets = [0, ...q.compare.filter((k) => k > 0).sort()];
  const ranges: Record<number, Range> = {};
  offsets.forEach((k) => (ranges[k] = shiftRange(base, k)));
  const sportFilter = q.sports && q.sports.length ? new Set(q.sports) : null;
  const dims = q.groupBy.map((g) => DIM[g]).filter(Boolean).slice(0, 2);

  const inRange = <T extends { date: string }>(xs: T[], r: Range) => xs.filter((x) => x.date >= r.from && x.date <= r.to);
  const perOffset: Record<number, { acts: Activity[]; well: Wellness[] }> = {};
  const empty: Record<number, boolean> = {};
  for (const k of offsets) {
    const a = inRange(acts, ranges[k]).filter((x) => !sportFilter || sportFilter.has(x.sport));
    const w = inRange(wellness, ranges[k]);
    perOffset[k] = { acts: a, well: w };
    // sem dados = nenhuma atividade E nenhum dado de saúde em todo o período (sem filtros)
    empty[k] = inRange(acts, ranges[k]).length === 0 && w.length === 0;
  }

  const metrics = q.metrics.map((k) => METRIC[k]).filter(Boolean);
  const aggOf = (m: MetricDef) => q.agg?.[m.key] ?? m.defaultAgg;

  const cellsFor = (filter: (x: any, isWell: boolean) => boolean): Record<string, Cell> => {
    const out: Record<string, Cell> = {};
    for (const m of metrics) {
      out[m.key] = {};
      for (const k of offsets) {
        if (empty[k]) { out[m.key][k] = null; continue; }
        const src = m.source === "activity" ? perOffset[k].acts.filter((x) => filter(x, false)) : perOffset[k].well.filter((x) => filter(x, true));
        out[m.key][k] = aggregate(src, m, aggOf(m), p);
      }
    }
    return out;
  };

  const build = (level: number, path: { dim: DimDef; key: string }[]): StatsRow[] => {
    if (level >= dims.length) return [];
    const dim = dims[level];
    const keys = new Set<string>();
    for (const k of offsets) {
      for (const a of perOffset[k].acts) if (path.every((pp) => pp.dim.keyOf(a, p) === pp.key)) keys.add(dim.keyOf(a, p));
      if (dim.time && path.every((pp) => pp.dim.time)) for (const w of perOffset[k].well) if (path.every((pp) => pp.dim.keyOf(w, p) === pp.key)) keys.add(dim.keyOf(w, p));
    }
    const rows: StatsRow[] = [];
    for (const key of keys) {
      const full = [...path, { dim, key }];
      const values = cellsFor((x, isWell) => {
        if (isWell && full.some((f) => !f.dim.time)) return false;
        return full.every((f) => f.dim.keyOf(x, p) === f.key);
      });
      rows.push({ key, label: dim.labelOf(key), sort: dim.sortOf(key), values, children: level + 1 < dims.length ? build(level + 1, full) : undefined });
    }
    return rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  };

  return { offsets, ranges, rows: build(0, []), total: cellsFor(() => true), empty };
}

export function delta(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur == null || prev == null) return null;
  return { abs: cur - prev, pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null };
}

/** true = a variação é favorável (verde) */
export function isGood(m: MetricDef, abs: number): boolean {
  return m.higherIsBetter ? abs >= 0 : abs <= 0;
}

// ───────────── Acumulado ao longo do período (linhas por ano) ─────────────

export interface CumPoint { day: number; label: string; [offset: string]: number | string | null }

export function cumulative(acts: Activity[], metricKey: string, q: Pick<StatsQuery, "period" | "compare" | "sports">, p: AthleteProfile, today = todayISO()) {
  const m = METRIC[metricKey];
  const base = resolvePeriod({ ...q.period, seasonStartMonth: q.period.seasonStartMonth ?? p.seasonStartMonth }, today);
  const offsets = [0, ...q.compare.filter((k) => k > 0).sort()];
  const sportFilter = q.sports && q.sports.length ? new Set(q.sports) : null;
  const len = diffDays(base.from, base.to) + 1;
  // para o ano atual, o acumulado pára em "hoje"
  const fullLen = q.period.kind === "ytd" ? diffDays(base.from, `${year(base.from)}-12-31`) + 1 : len;
  const series: Record<number, number[]> = {};
  const ranges: Record<number, Range> = {};
  for (const k of offsets) {
    const r = k === 0 ? base : shiftRange({ from: base.from, to: addDays(base.from, fullLen - 1) }, k);
    ranges[k] = r;
    const perDay = new Array(fullLen).fill(0);
    for (const a of acts) {
      if (a.date < r.from || a.date > r.to) continue;
      if (sportFilter && !sportFilter.has(a.sport)) continue;
      const i = diffDays(r.from, a.date);
      if (i >= 0 && i < fullLen) perDay[i] += m.value(a, p) ?? 0;
    }
    let s = 0;
    series[k] = perDay.map((v) => (s += v));
  }
  const points: CumPoint[] = [];
  for (let i = 0; i < fullLen; i++) {
    const d = addDays(base.from, i);
    const pt: CumPoint = { day: i, label: `${Number(d.slice(8))} ${MONTHS_PT[month(d) - 1]}` };
    for (const k of offsets) pt[`y${k}`] = k === 0 && i >= len ? null : series[k][i];
    points.push(pt);
  }
  return { points, offsets, ranges, metric: m };
}
