import type { Phase, Race, RaceDistance } from "../types";
import { addDays, diffDays, startOfWeek } from "../dates";

/**
 * Periodização clássica a partir das provas A (as B fazem mini-taper, as C não mexem no plano):
 *   … base → construção → pico → taper → PROVA → recuperação → (transição até à base seguinte)
 * Durações em dias, por distância da prova.
 */
export const PHASE_DAYS: Record<RaceDistance, { taper: number; peak: number; build: number; recovery: number }> = {
  sprint: { taper: 7, peak: 14, build: 42, recovery: 4 },
  olympic: { taper: 10, peak: 14, build: 56, recovery: 7 },
  half: { taper: 12, peak: 21, build: 56, recovery: 10 },
  full: { taper: 16, peak: 21, build: 70, recovery: 21 },
  other: { taper: 7, peak: 14, build: 42, recovery: 7 },
};

export interface PhaseSegment { phase: Phase; from: string; to: string; raceId?: string }

/** Constrói a época entre `from` e `to`. Sem provas A, tudo é base. */
export function buildSeason(races: Race[], from: string, to: string): PhaseSegment[] {
  const aRaces = races.filter((r) => r.priority === "A").sort((a, b) => (a.date < b.date ? -1 : 1));
  const segs: PhaseSegment[] = [];
  let cursor = from;

  const push = (phase: Phase, a: string, b: string, raceId?: string) => {
    const s = a < cursor ? cursor : a;
    const e = b > to ? to : b;
    if (s > e) return;
    // fundir com o anterior se for a mesma fase
    const last = segs[segs.length - 1];
    if (last && last.phase === phase && addDays(last.to, 1) === s && !raceId && !last.raceId) last.to = e;
    else segs.push({ phase, from: s, to: e, raceId });
    cursor = addDays(e, 1);
  };

  for (const r of aRaces) {
    const d = PHASE_DAYS[r.distance] ?? PHASE_DAYS.other;
    const taperStart = addDays(r.date, -d.taper);
    const peakStart = addDays(taperStart, -d.peak);
    const buildStart = addDays(peakStart, -d.build);
    if (r.date < cursor) continue; // prova já coberta por uma anterior
    push(cursor < buildStart ? "base" : "build", cursor, addDays(buildStart, -1));
    push("build", buildStart, addDays(peakStart, -1));
    push("peak", peakStart, addDays(taperStart, -1));
    push("taper", taperStart, addDays(r.date, -1));
    push("race", r.date, r.date, r.id);
    push("recovery", addDays(r.date, 1), addDays(r.date, d.recovery));
    // transição curta depois de uma prova longa
    if (r.distance === "full" || r.distance === "half") push("transition", cursor, addDays(cursor, r.distance === "full" ? 13 : 6));
  }
  if (cursor <= to) push("base", cursor, to);
  return segs;
}

export function phaseOn(segs: PhaseSegment[], date: string): PhaseSegment | null {
  return segs.find((s) => date >= s.from && date <= s.to) ?? null;
}

/** Fator de carga semanal (× CTL × 7) por fase. A cada 4.ª semana de base/construção, semana de descarga. */
const PHASE_FACTOR: Record<Phase, number> = { transition: 0.45, base: 1.05, build: 1.12, peak: 1.06, taper: 0.62, race: 0.55, recovery: 0.5 };

export interface WeekTarget {
  weekStart: string;
  phase: Phase;
  recoveryWeek: boolean;
  tss: number;
  /** horas de treino estimadas */
  hours: number;
  /** provas B nesta semana (mini-taper) */
  bRace?: Race | null;
}

export function weekTarget(segs: PhaseSegment[], races: Race[], weekStart: string, ctl: number): WeekTarget {
  const ws = startOfWeek(weekStart);
  // fase dominante da semana
  const count: Partial<Record<Phase, number>> = {};
  for (let i = 0; i < 7; i++) { const p = phaseOn(segs, addDays(ws, i))?.phase ?? "base"; count[p] = (count[p] ?? 0) + 1; }
  const phase = (Object.entries(count).sort((a, b) => b[1]! - a[1]!)[0]?.[0] ?? "base") as Phase;
  const raceInWeek = segs.some((s) => s.phase === "race" && s.from >= ws && s.from <= addDays(ws, 6));
  const seg = phaseOn(segs, ws);
  const weekIdx = seg ? Math.floor(diffDays(seg.from, ws) / 7) : 0;
  const recoveryWeek = (phase === "base" || phase === "build") && weekIdx % 4 === 3;
  const bRace = races.find((r) => r.priority === "B" && r.date >= ws && r.date <= addDays(ws, 6)) ?? null;
  let factor = raceInWeek ? PHASE_FACTOR.race : PHASE_FACTOR[phase];
  if (recoveryWeek) factor *= 0.7;
  if (bRace) factor *= 0.8;
  const base = Math.max(ctl, 35); // evita alvos irrisórios para quem começa
  const tss = Math.round(base * 7 * factor);
  return { weekStart: ws, phase: raceInWeek ? "race" : phase, recoveryWeek, tss, hours: +(tss / 60).toFixed(1), bRace };
}

export function nextRace(races: Race[], today: string): Race | null {
  return races.filter((r) => r.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.priority < b.priority ? -1 : 1))[0] ?? null;
}
