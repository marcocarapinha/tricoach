import type { Activity, ActivityStreams, AthleteProfile, Lap } from "../types";
import { addDays } from "../dates";
import { activityTss } from "./load";

const valid = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter(valid); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/** Potência normalizada: média móvel de 30 s, à 4.ª potência, média, raiz 4. */
export function normalizedPower(power: (number | null)[], sampleS: number): number | null {
  const w = Math.max(1, Math.round(30 / sampleS));
  if (power.filter(valid).length < w) return null;
  const roll: number[] = [];
  let sum = 0;
  const q: number[] = [];
  for (const p of power) {
    const v = p ?? 0;
    q.push(v); sum += v;
    if (q.length > w) sum -= q.shift()!;
    if (q.length === w) roll.push(sum / w);
  }
  const m4 = roll.reduce((s, x) => s + x ** 4, 0) / roll.length;
  return Math.round(m4 ** 0.25);
}

/**
 * Desacoplamento aeróbio (Pa:HR / Pw:HR): compara a relação ritmo/FC (ou potência/FC) da 1.ª e da 2.ª metade.
 * < 5% indica boa base aeróbia num treino contínuo em Z2.
 */
export function decoupling(s: ActivityStreams): { pct: number; basis: "power" | "speed" } | null {
  const basis = s.power && s.power.filter(valid).length > s.t.length * 0.5 ? "power" : s.speed ? "speed" : null;
  if (!basis || !s.hr) return null;
  const out = basis === "power" ? s.power! : s.speed!;
  const idx = s.t.map((_, i) => i).filter((i) => valid(s.hr![i]) && valid(out[i]));
  if (idx.length < 20) return null;
  const half = Math.floor(idx.length / 2);
  const ratio = (ids: number[]) => avg(ids.map((i) => out[i]))! / avg(ids.map((i) => s.hr![i]))!;
  const r1 = ratio(idx.slice(0, half)), r2 = ratio(idx.slice(half));
  return { pct: +(((r1 - r2) / r1) * 100).toFixed(1), basis };
}

/** Tempo (s) em cada zona de FC (% LTHR: <85, 85–89, 90–94, 95–99, ≥100). */
export function hrZoneTimes(s: ActivityStreams, p: AthleteProfile): number[] {
  const z = [0, 0, 0, 0, 0];
  const lim = [0.85, 0.9, 0.95, 1.0].map((f) => p.lthr * f);
  for (const h of s.hr ?? []) {
    if (!valid(h)) continue;
    const i = lim.findIndex((l) => h < l);
    z[i === -1 ? 4 : i] += s.sampleS;
  }
  return z;
}

export interface ActivityAnalysis {
  durationS: number;
  np: number | null;
  IF: number | null;
  tss: number;
  ef: number | null; // fator de eficiência: NP/FC (bici) ou velocidade(m/min)/FC (corrida/natação)
  decoupling: { pct: number; basis: "power" | "speed" } | null;
  hrZones: number[];
  laps: Lap[];
}

export function analyse(a: Activity, s: ActivityStreams | null, p: AthleteProfile): ActivityAnalysis {
  const np = s?.power ? normalizedPower(s.power, s.sampleS) : a.normPower ?? null;
  const hr = s?.hr ? avg(s.hr) : a.avgHr ?? null;
  const speedAvg = a.durationS > 0 ? a.distanceM / a.durationS : null;
  const ef = hr ? (a.sport === "bike" && np ? +(np / hr).toFixed(2) : speedAvg ? +((speedAvg * 60) / hr).toFixed(2) : null) : null;
  return {
    durationS: a.durationS,
    np,
    IF: np && p.ftp ? +(np / p.ftp).toFixed(2) : null,
    tss: Math.round(activityTss(a, p)),
    ef,
    // só faz sentido em esforço contínuo (não em séries nem provas com transições)
    decoupling: s && a.sessionType !== "intervals" && a.sessionType !== "race" && a.durationS >= 40 * 60 ? decoupling(s) : null,
    hrZones: s ? hrZoneTimes(s, p) : (a.zoneSeconds ?? [0, 0, 0, 0, 0]),
    laps: s?.laps ?? [],
  };
}

/** Treinos semelhantes: mesma modalidade e tipo, duração ±25%, nos 365 dias anteriores. */
export function similarActivities(a: Activity, acts: Activity[], limit = 8): Activity[] {
  return acts
    .filter((x) => x.id !== a.id && x.sport === a.sport && (x.sessionType ?? null) === (a.sessionType ?? null) && x.date >= addDays(a.date, -365) && x.date <= a.date
      && Math.abs(x.durationS - a.durationS) <= a.durationS * 0.25)
    .sort((x, y) => (x.date < y.date ? 1 : -1))
    .slice(0, limit);
}

/** Eficiência de uma atividade a partir do resumo (sem streams), para comparar com semelhantes. */
export function summaryEf(a: Activity): number | null {
  if (!a.avgHr) return null;
  if (a.sport === "bike" && a.normPower) return +(a.normPower / a.avgHr).toFixed(2);
  if (a.distanceM > 0 && a.durationS > 0) return +(((a.distanceM / a.durationS) * 60) / a.avgHr).toFixed(2);
  return null;
}
