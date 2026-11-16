import type { Activity, AthleteProfile, Sport } from "../types";
import { addDays, dayRange } from "../dates";

/**
 * Carga de treino (TSS) por atividade.
 * Prioridade: TSS da Garmin → potência (ciclismo) → ritmo (corrida/natação) → FC (hrTSS) → estimativa por duração.
 */
export function activityTss(a: Activity, p: AthleteProfile): number {
  if (a.tss != null && a.tss > 0) return a.tss;
  const h = a.durationS / 3600;
  if (h <= 0) return 0;

  if (a.sport === "bike" && a.normPower && p.ftp > 0) {
    const IF = a.normPower / p.ftp;
    return h * IF * IF * 100;
  }
  if (a.sport === "run" && a.distanceM > 0 && p.runThresholdPace > 0) {
    const pace = a.durationS / (a.distanceM / 1000);
    const IF = p.runThresholdPace / pace;
    return h * IF * IF * 100;
  }
  if (a.sport === "swim" && a.distanceM > 0 && p.css > 0) {
    const pace100 = a.durationS / (a.distanceM / 100);
    const IF = p.css / pace100;
    return h * IF * IF * IF * 100;
  }
  if (a.avgHr && p.lthr > 0) {
    const IF = a.avgHr / p.lthr;
    return h * IF * IF * 100;
  }
  const perHour: Record<Sport, number> = { swim: 55, bike: 60, run: 65, brick: 75, strength: 40, other: 35 };
  return h * perHour[a.sport];
}

/** Fator de intensidade aproximado (0..1.2) usado para classificar a sessão. */
export function intensityFactor(a: Activity, p: AthleteProfile): number {
  const h = a.durationS / 3600;
  if (h <= 0) return 0;
  return Math.sqrt(activityTss(a, p) / (h * 100));
}

export function dominantZone(a: Activity, p: AthleteProfile): number {
  if (a.zoneSeconds && a.zoneSeconds.some((z) => z > 0)) {
    let best = 0;
    a.zoneSeconds.forEach((z, i) => { if (z > a.zoneSeconds![best]) best = i; });
    return best + 1;
  }
  const IF = intensityFactor(a, p);
  if (IF < 0.65) return 1;
  if (IF < 0.8) return 2;
  if (IF < 0.9) return 3;
  if (IF < 1.0) return 4;
  return 5;
}

export interface LoadDay {
  date: string;
  tss: number;
  bySport: Partial<Record<Sport, number>>;
  ctl: number; // forma (42 dias)
  atl: number; // fadiga (7 dias)
  tsb: number; // frescura = CTL(ontem) - ATL(ontem)
}

/** Série diária de CTL/ATL/TSB. Começa a calcular 200 dias antes de `from` para estabilizar as médias. */
export function loadSeries(acts: Activity[], p: AthleteProfile, from: string, to: string): LoadDay[] {
  const warm = addDays(from, -200);
  const perDay = new Map<string, { tss: number; bySport: Partial<Record<Sport, number>> }>();
  for (const a of acts) {
    if (a.date < warm || a.date > to) continue;
    const t = activityTss(a, p);
    const e = perDay.get(a.date) ?? { tss: 0, bySport: {} };
    e.tss += t;
    e.bySport[a.sport] = (e.bySport[a.sport] ?? 0) + t;
    perDay.set(a.date, e);
  }
  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  let ctl = 0, atl = 0;
  const out: LoadDay[] = [];
  for (const d of dayRange(warm, to)) {
    const e = perDay.get(d) ?? { tss: 0, bySport: {} };
    const tsb = ctl - atl;
    ctl = ctl + (e.tss - ctl) * kC;
    atl = atl + (e.tss - atl) * kA;
    if (d >= from) out.push({ date: d, tss: e.tss, bySport: e.bySport, ctl, atl, tsb });
  }
  return out;
}

/** Variação de CTL nos últimos 7 dias. */
export function weeklyRamp(series: LoadDay[], date: string): number | null {
  const i = series.findIndex((s) => s.date === date);
  if (i < 7) return null;
  return series[i].ctl - series[i - 7].ctl;
}

/** Percentagem de tempo por zona num período. */
export function zoneDistribution(acts: Activity[], p: AthleteProfile, from: string, to: string): number[] {
  const z = [0, 0, 0, 0, 0];
  for (const a of acts) {
    if (a.date < from || a.date > to) continue;
    if (a.zoneSeconds && a.zoneSeconds.length === 5) a.zoneSeconds.forEach((s, i) => (z[i] += s));
    else z[dominantZone(a, p) - 1] += a.durationS;
  }
  const tot = z.reduce((s, x) => s + x, 0) || 1;
  return z.map((x) => (x / tot) * 100);
}
