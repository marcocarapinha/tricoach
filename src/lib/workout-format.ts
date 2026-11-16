import type { AthleteProfile, PlannedSession, SimpleStep, Sport, StepTarget, WorkoutStep } from "./types";
import { fmtPace } from "./dates";
import { encodeWorkoutFit } from "./engine/fit-workout";

export function fmtTarget(t: StepTarget, sport: Sport): string {
  if (t.type === "power") return `${t.low}–${t.high} W`;
  if (t.type === "hr") return `${t.low}–${t.high} bpm`;
  if (t.type === "pace" && t.low && t.high) return `${fmtPace(t.low)}–${fmtPace(t.high)} ${sport === "swim" ? "/100m" : "/km"}`;
  return "livre";
}

export function fmtStep(s: SimpleStep, sport: Sport): string {
  const amount = s.durationS ? (s.durationS >= 60 ? `${Math.round(s.durationS / 60)} min` : `${s.durationS} s`) : s.distanceM ? `${s.distanceM} m` : "até carregar no botão";
  const tgt = fmtTarget(s.target, sport);
  return `${s.name ? s.name + " · " : ""}${amount}${tgt !== "livre" ? ` · ${tgt}` : ""}`;
}

export function stepLines(steps: WorkoutStep[] | null | undefined, sport: Sport): { text: string; repeat?: number; children?: string[] }[] {
  return (steps ?? []).map((s) => (s.kind === "repeat" ? { text: `${s.times}×`, repeat: s.times, children: s.steps.map((x) => fmtStep(x, sport)) } : { text: fmtStep(s, sport) }));
}

/** Descarrega o treino como ficheiro .FIT (importável no Garmin Connect → Treinos). */
export function downloadWorkoutFit(session: PlannedSession) {
  const bytes = encodeWorkoutFit(session);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${session.date}-${session.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase()}.fit`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type { AthleteProfile };
