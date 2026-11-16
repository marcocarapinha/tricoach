import type { Activity, AthleteProfile, Phase, PlannedSession, SessionType, SimpleStep, Sport, StepTarget, WorkoutStep } from "../types";
import { SESSION_LABEL, SPORT_LABEL } from "../types";
import { addDays, startOfWeek, todayISO } from "../dates";
import { activityTss } from "./load";
import type { WeekTarget } from "./periodization";

// ───────────── Intensidade por tipo de sessão ─────────────

export const TYPE_IF: Record<SessionType, number> = {
  recovery: 0.55, technique: 0.6, endurance: 0.68, long: 0.7, tempo: 0.82, intervals: 0.85, race: 0.9, functional: 0.5,
};

export function plannedTss(sport: Sport, type: SessionType, durationMin: number): number {
  const IF = TYPE_IF[type] * (sport === "swim" ? 0.95 : 1);
  return Math.round((durationMin / 60) * IF * IF * 100);
}

// ───────────── Modelos semanais por fase ─────────────
// [dia 0=seg … 6=dom, modalidade, tipo, peso relativo de duração]
type Slot = [number, Sport, SessionType, number];

const TEMPLATES: Record<Phase, Slot[]> = {
  base: [
    [0, "swim", "technique", 0.8], [1, "bike", "endurance", 1.2], [1, "run", "recovery", 0.5], [2, "swim", "endurance", 0.9],
    [2, "run", "endurance", 0.9], [3, "bike", "tempo", 1.1], [4, "swim", "intervals", 0.8], [5, "bike", "long", 2.6], [6, "run", "long", 1.5],
  ],
  build: [
    [0, "swim", "intervals", 0.9], [1, "bike", "intervals", 1.2], [1, "run", "recovery", 0.5], [2, "swim", "endurance", 0.9],
    [2, "run", "intervals", 1.0], [3, "bike", "endurance", 1.3], [4, "swim", "technique", 0.7], [5, "bike", "long", 2.8], [5, "run", "tempo", 0.4], [6, "run", "long", 1.6],
  ],
  peak: [
    [0, "swim", "intervals", 0.9], [1, "bike", "tempo", 1.3], [2, "swim", "endurance", 0.9], [2, "run", "tempo", 1.0],
    [3, "bike", "endurance", 1.0], [4, "swim", "technique", 0.6], [5, "bike", "long", 2.6], [5, "run", "tempo", 0.5], [6, "run", "long", 1.4],
  ],
  taper: [
    [0, "swim", "technique", 0.8], [1, "bike", "intervals", 1.0], [2, "run", "intervals", 0.8], [3, "swim", "intervals", 0.8],
    [4, "bike", "endurance", 0.8], [5, "run", "recovery", 0.5], [6, "bike", "recovery", 0.6],
  ],
  race: [[0, "swim", "technique", 0.6], [1, "bike", "intervals", 0.7], [2, "run", "recovery", 0.5], [3, "swim", "recovery", 0.5], [4, "bike", "recovery", 0.4]],
  recovery: [[1, "swim", "recovery", 0.8], [3, "bike", "recovery", 1.0], [5, "run", "recovery", 0.7], [6, "bike", "endurance", 1.0]],
  transition: [[1, "swim", "recovery", 0.8], [4, "bike", "recovery", 1.0], [6, "run", "recovery", 0.8]],
};

const MAX_MIN: Record<Sport, number> = { swim: 90, bike: 330, run: 150, brick: 360, strength: 60, other: 90 };
const round5 = (x: number) => Math.max(20, Math.round(x / 5) * 5);

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));

/** Gera as sessões da semana com o modelo da fase, escaladas para o TSS-alvo. Dias de prova B/A ficam livres. */
export function generateWeek(target: WeekTarget, p: AthleteProfile, raceDates: string[] = [], restDays: number[] = []): PlannedSession[] {
  const ws = startOfWeek(target.weekStart);
  // dia da prova e véspera ficam livres
  const blocked = (d: number) => raceDates.includes(addDays(ws, d)) || raceDates.includes(addDays(ws, d + 1));
  const slots = placeSlots(TEMPLATES[target.phase].filter(([d]) => !blocked(d)), restDays, blocked);
  // TSS por unidade de peso (1 unidade = 60 min)
  const unitTss = slots.reduce((s, [, sp, ty, w]) => s + plannedTss(sp, ty, 60 * w), 0) || 1;
  const k = target.tss / unitTss;
  return slots.map(([d, sport, type, w]) => {
    const durationMin = Math.min(MAX_MIN[sport], round5(60 * w * k));
    const steps = buildSteps(sport, type, durationMin, p);
    return {
      id: uid(), date: addDays(ws, d), sport, type, durationMin,
      tss: plannedTss(sport, type, durationMin),
      title: `${SPORT_LABEL[sport]} · ${SESSION_LABEL[type]}`,
      description: describe(sport, type, durationMin),
      steps,
      source: "app" as const,
    };
  });
}

/**
 * Tira as sessões dos dias de descanso escolhidos pelo atleta e passa-as para o dia livre mais próximo
 * (no máximo 2 sessões por dia). Se não houver lugar, a sessão cai e o TSS é redistribuído pelas restantes.
 */
export function placeSlots(slots: Slot[], restDays: number[], blocked: (d: number) => boolean = () => false): Slot[] {
  if (!restDays.length) return slots;
  const rest = new Set(restDays);
  const count = new Map<number, number>();
  const kept: Slot[] = slots.filter(([d]) => !rest.has(d));
  for (const [d] of kept) count.set(d, (count.get(d) ?? 0) + 1);
  for (const s of slots.filter(([d]) => rest.has(d))) {
    const [d] = s;
    const cand = [1, -1, 2, -2, 3, -3].map((o) => d + o).filter((x) => x >= 0 && x <= 6 && !rest.has(x) && !blocked(x) && (count.get(x) ?? 0) < 2);
    // não juntar duas sessões da mesma modalidade no mesmo dia
    const target = cand.find((x) => !kept.some(([kd, ks]) => kd === x && ks === s[1])) ?? cand[0];
    if (target == null) continue;
    kept.push([target, s[1], s[2], s[3]]);
    count.set(target, (count.get(target) ?? 0) + 1);
  }
  return kept.sort((a, b) => a[0] - b[0]);
}

function describe(sport: Sport, type: SessionType, min: number) {
  const z = { recovery: "Z1", technique: "Z1–Z2 com técnica", endurance: "Z2", long: "Z2 contínuo", tempo: "blocos em Z3", intervals: "séries em Z4", race: "ritmo de prova", functional: "força e mobilidade" }[type];
  return `${min} min de ${SPORT_LABEL[sport].toLowerCase()}, ${z}.`;
}

// ───────────── Passos do treino (exportáveis para FIT) ─────────────

/** Alvos por zona (1–5) e modalidade, a partir dos limiares do perfil. */
export function zoneTarget(sport: Sport, zone: 1 | 2 | 3 | 4 | 5, p: AthleteProfile): StepTarget {
  if (sport === "bike") {
    const pct: Record<number, [number, number]> = { 1: [0.4, 0.55], 2: [0.56, 0.75], 3: [0.76, 0.9], 4: [0.91, 1.05], 5: [1.06, 1.2] };
    const [a, b] = pct[zone];
    return { type: "power", low: Math.round(p.ftp * a), high: Math.round(p.ftp * b) };
  }
  if (sport === "run") {
    // ritmo s/km: low = mais rápido, high = mais lento
    const f: Record<number, [number, number]> = { 1: [1.3, 1.45], 2: [1.18, 1.3], 3: [1.05, 1.15], 4: [0.98, 1.03], 5: [0.9, 0.97] };
    const [a, b] = f[zone];
    return { type: "pace", low: Math.round(p.runThresholdPace * a), high: Math.round(p.runThresholdPace * b) };
  }
  if (sport === "swim") {
    const f: Record<number, [number, number]> = { 1: [1.2, 1.35], 2: [1.08, 1.18], 3: [1.03, 1.07], 4: [0.98, 1.02], 5: [0.92, 0.97] };
    const [a, b] = f[zone];
    return { type: "pace", low: Math.round(p.css * a), high: Math.round(p.css * b) };
  }
  const hr: Record<number, [number, number]> = { 1: [0.65, 0.84], 2: [0.85, 0.89], 3: [0.9, 0.94], 4: [0.95, 0.99], 5: [1.0, 1.06] };
  const [a, b] = hr[zone];
  return { type: "hr", low: Math.round(p.lthr * a), high: Math.round(p.lthr * b) };
}

const st = (intensity: SimpleStep["intensity"], min: number, target: StepTarget, name?: string): SimpleStep => ({ kind: "step", intensity, durationS: Math.round(min * 60), target, name });
const sd = (intensity: SimpleStep["intensity"], m: number, target: StepTarget, name?: string): SimpleStep => ({ kind: "step", intensity, distanceM: m, target, name });

export function buildSteps(sport: Sport, type: SessionType, min: number, p: AthleteProfile): WorkoutStep[] {
  if (sport === "strength" || sport === "other" || sport === "brick") return [st("active", min, { type: "open" }, SESSION_LABEL[type])];
  const z = (n: 1 | 2 | 3 | 4 | 5) => zoneTarget(sport, n, p);
  const wu = Math.min(15, Math.max(8, Math.round(min * 0.15)));
  const cd = Math.min(10, Math.max(5, Math.round(min * 0.1)));
  const main = Math.max(5, min - wu - cd);

  if (sport === "swim") {
    // natação por distância, a partir do ritmo de cada zona (s/100 m)
    const m = (minutes: number, zone: 1 | 2 | 3 | 4 | 5) => Math.max(50, Math.round((minutes * 60) / (z(zone).high! / 100) / 50) * 50);
    if (type === "intervals" || type === "tempo") {
      const rep = type === "intervals" ? 100 : 200;
      const per = (rep / 100) * p.css + (type === "intervals" ? 20 : 30);
      const times = Math.max(3, Math.min(20, Math.floor((main * 60) / per)));
      return [sd("warmup", m(wu, 2), z(2), "Aquecimento"), { kind: "repeat", times, steps: [sd("active", rep, z(type === "intervals" ? 4 : 3), `${rep} m`), st("rest", type === "intervals" ? 1 / 3 : 0.5, { type: "open" }, "Pausa")] }, sd("cooldown", m(cd, 1), z(1), "Retorno")];
    }
    if (type === "technique") {
      return [sd("warmup", m(wu, 2), z(2), "Aquecimento"), { kind: "repeat", times: Math.max(4, Math.min(12, Math.round(main / 4))), steps: [sd("active", 50, { type: "open" }, "Exercício de técnica"), st("rest", 0.25, { type: "open" }, "Pausa")] }, sd("active", m(main / 2, 2), z(2), "Contínuo"), sd("cooldown", m(cd, 1), z(1), "Retorno")];
    }
    return [sd("warmup", m(wu, 2), z(2), "Aquecimento"), sd("active", m(main, type === "recovery" ? 1 : 2), z(type === "recovery" ? 1 : 2), "Contínuo"), sd("cooldown", m(cd, 1), z(1), "Retorno")];
  }

  if (type === "intervals") {
    const [work, rest] = sport === "run" ? [4, 2] : [5, 3];
    const times = Math.max(3, Math.min(10, Math.floor(main / (work + rest))));
    return [st("warmup", wu, z(2), "Aquecimento"), { kind: "repeat", times, steps: [st("active", work, z(4), `${work} min forte`), st("recovery", rest, z(1), "Recuperação")] }, st("cooldown", cd + Math.max(0, main - times * (work + rest)), z(1), "Retorno")];
  }
  if (type === "tempo") {
    const block = sport === "run" ? 12 : 15;
    const times = Math.max(1, Math.min(4, Math.floor(main / (block + 5))));
    return [st("warmup", wu, z(2), "Aquecimento"), { kind: "repeat", times, steps: [st("active", block, z(3), `${block} min tempo`), st("recovery", 5, z(2), "Solto")] }, st("cooldown", cd + Math.max(0, main - times * (block + 5)), z(1), "Retorno")];
  }
  const zone = type === "recovery" ? 1 : 2;
  return [st("warmup", wu, z(1), "Aquecimento"), st("active", main, z(zone), type === "long" ? "Longo contínuo" : "Contínuo"), st("cooldown", cd, z(1), "Retorno")];
}

export function stepsDurationMin(steps: WorkoutStep[], sport: Sport, p: AthleteProfile): number {
  const one = (s: SimpleStep) => s.durationS ? s.durationS / 60 : s.distanceM ? (s.distanceM / (sport === "swim" ? 100 : 1000)) * ((s.target.high ?? (sport === "swim" ? p.css * 1.1 : p.runThresholdPace * 1.2)) / 60) : 0;
  return Math.round(steps.reduce((sum, s) => sum + (s.kind === "repeat" ? s.times * s.steps.reduce((a, x) => a + one(x), 0) : one(s)), 0));
}

// ───────────── Planeado vs realizado ─────────────

export type SessionStatus = "done" | "partial" | "missed" | "today" | "planned";

export interface SessionMatch { session: PlannedSession; activity: Activity | null; status: SessionStatus; ratio: number | null }

const sportMatches = (planned: Sport, actual: Sport) => planned === actual || (planned === "brick" && (actual === "bike" || actual === "run"));

/** Emparelha sessões planeadas com atividades do mesmo dia e modalidade (a de duração mais próxima). */
export function matchWeek(planned: PlannedSession[], acts: Activity[], today = todayISO()): { matches: SessionMatch[]; unplanned: Activity[] } {
  const used = new Set<string>();
  const sorted = [...planned].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.durationMin - a.durationMin));
  const matches = sorted.map((s) => {
    const cands = acts.filter((a) => a.date === s.date && sportMatches(s.sport, a.sport) && !used.has(a.id));
    const best = cands.sort((a, b) => Math.abs(a.durationS / 60 - s.durationMin) - Math.abs(b.durationS / 60 - s.durationMin))[0] ?? null;
    if (best) used.add(best.id);
    const ratio = best && s.durationMin > 0 ? best.durationS / 60 / s.durationMin : null;
    const status: SessionStatus = best ? (ratio! >= 0.7 ? "done" : "partial") : s.date < today ? "missed" : s.date === today ? "today" : "planned";
    return { session: s, activity: best, status, ratio };
  });
  const dates = new Set(planned.map((s) => s.date));
  const from = planned.length ? [...dates].sort()[0] : today;
  const to = planned.length ? [...dates].sort().at(-1)! : today;
  const unplanned = acts.filter((a) => !used.has(a.id) && a.date >= startOfWeek(from) && a.date <= addDays(startOfWeek(to), 6));
  return { matches, unplanned };
}

export interface WeekCompliance {
  plannedMin: number; actualMin: number; plannedTss: number; actualTss: number;
  /** % das sessões passadas cumpridas (≥ 70% da duração) */
  sessionsDone: number; sessionsDue: number;
  /** cumprimento de volume (0–120%) */
  volumePct: number | null;
  bySport: Partial<Record<Sport, { planned: number; actual: number }>>;
}

export function weekCompliance(matches: SessionMatch[], unplanned: Activity[], p: AthleteProfile): WeekCompliance {
  const bySport: WeekCompliance["bySport"] = {};
  let plannedMin = 0, actualMin = 0, plannedTssSum = 0, actualTss = 0, done = 0, due = 0, capped = 0, duePlanned = 0;
  for (const m of matches) {
    plannedMin += m.session.durationMin;
    plannedTssSum += m.session.tss ?? plannedTss(m.session.sport, m.session.type, m.session.durationMin);
    const b = (bySport[m.session.sport] ??= { planned: 0, actual: 0 });
    b.planned += m.session.durationMin;
    if (m.status !== "planned" && m.status !== "today") { due++; duePlanned += m.session.durationMin; }
    if (m.activity) {
      const a = m.activity.durationS / 60;
      actualMin += a; b.actual += a; actualTss += activityTss(m.activity, p);
      capped += Math.min(a, m.session.durationMin * 1.2);
      if (m.status === "done") done++;
    }
  }
  for (const a of unplanned) {
    actualMin += a.durationS / 60; actualTss += activityTss(a, p);
    const b = (bySport[a.sport] ??= { planned: 0, actual: 0 }); b.actual += a.durationS / 60;
  }
  return {
    plannedMin: Math.round(plannedMin), actualMin: Math.round(actualMin), plannedTss: Math.round(plannedTssSum), actualTss: Math.round(actualTss),
    sessionsDone: done, sessionsDue: due, volumePct: duePlanned > 0 ? Math.round((capped / duePlanned) * 100) : null, bySport,
  };
}
