import type { Activity, Sport } from "../types";
import { year } from "../dates";

/**
 * Recordes pessoais a partir dos campos da Garmin em cada atividade (SummarizedActivityDTO):
 *   fastestSplit_<metros> (s) e maxAvgPower_<segundos> (W).
 */
export interface BestDef { key: string; label: string; sport: Sport; kind: "time" | "power"; group: string }

export const BESTS: BestDef[] = [
  { key: "fastestSplit_100", label: "100 m", sport: "swim", kind: "time", group: "Natação" },
  { key: "fastestSplit_400", label: "400 m", sport: "swim", kind: "time", group: "Natação" },
  { key: "fastestSplit_750", label: "750 m", sport: "swim", kind: "time", group: "Natação" },
  { key: "fastestSplit_1500", label: "1500 m", sport: "swim", kind: "time", group: "Natação" },
  { key: "fastestSplit_1000", label: "1 km", sport: "run", kind: "time", group: "Corrida" },
  { key: "fastestSplit_5000", label: "5 km", sport: "run", kind: "time", group: "Corrida" },
  { key: "fastestSplit_10000", label: "10 km", sport: "run", kind: "time", group: "Corrida" },
  { key: "fastestSplit_21098", label: "Meia maratona", sport: "run", kind: "time", group: "Corrida" },
  { key: "fastestSplit_42195", label: "Maratona", sport: "run", kind: "time", group: "Corrida" },
  { key: "fastestSplit_40000", label: "40 km", sport: "bike", kind: "time", group: "Ciclismo" },
  { key: "maxAvgPower_5", label: "Potência 5 s", sport: "bike", kind: "power", group: "Ciclismo" },
  { key: "maxAvgPower_60", label: "Potência 1 min", sport: "bike", kind: "power", group: "Ciclismo" },
  { key: "maxAvgPower_300", label: "Potência 5 min", sport: "bike", kind: "power", group: "Ciclismo" },
  { key: "maxAvgPower_1200", label: "Potência 20 min", sport: "bike", kind: "power", group: "Ciclismo" },
  { key: "maxAvgPower_3600", label: "Potência 60 min", sport: "bike", kind: "power", group: "Ciclismo" },
];

/** Durações da curva de potência (s), as que a Garmin expõe. */
export const POWER_DURATIONS = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 18000];

export interface BestHit { value: number; activityId: string; date: string; name: string }

const better = (d: BestDef, a: number, b: number) => (d.kind === "time" ? a < b : a > b);

/** Melhor marca por recorde, no geral e por ano civil. */
export function computeBests(acts: Activity[]) {
  const allTime: Record<string, BestHit> = {};
  const byYear: Record<number, Record<string, BestHit>> = {};
  for (const a of acts) {
    if (!a.bests) continue;
    for (const d of BESTS) {
      const v = a.bests[d.key];
      if (v == null || !(v > 0) || (d.sport !== a.sport && !(a.sport === "brick"))) continue;
      const hit = { value: v, activityId: a.id, date: a.date, name: a.name };
      if (!allTime[d.key] || better(d, v, allTime[d.key].value)) allTime[d.key] = hit;
      const y = year(a.date);
      const yb = (byYear[y] ??= {});
      if (!yb[d.key] || better(d, v, yb[d.key].value)) yb[d.key] = hit;
    }
  }
  return { allTime, byYear };
}

/** Curva de potência (melhor média por duração) para as atividades dadas. */
export function powerCurve(acts: Activity[]): { duration: number; watts: number | null }[] {
  return POWER_DURATIONS.map((s) => {
    let best: number | null = null;
    for (const a of acts) { const v = a.bests?.[`maxAvgPower_${s}`]; if (v != null && v > 0 && (best == null || v > best)) best = v; }
    return { duration: s, watts: best };
  });
}

/** Recordes batidos numa atividade (face ao melhor anterior a ela). */
export function prsIn(a: Activity, acts: Activity[]): BestDef[] {
  if (!a.bests) return [];
  const before = computeBests(acts.filter((x) => x.date < a.date || (x.date === a.date && x.id !== a.id && x.id < a.id))).allTime;
  return BESTS.filter((d) => { const v = a.bests![d.key]; return v != null && v > 0 && (!before[d.key] || better(d, v, before[d.key].value)); });
}

export function fmtDurationLabel(s: number) {
  return s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`;
}
