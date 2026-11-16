// Resumo diário para notificação push, calculado no servidor a partir de daily_wellness e planned_sessions.
// Mesmas regras de saúde que a app (bases pessoais: média de 7 dias vs banda dos 60 dias anteriores).
// Módulo puro, testado com Vitest.

export interface WellnessRow { day: string; hrv?: number | null; rhr?: number | null; sleep_s?: number | null }
export interface PlannedRow { sport: string; session_type: string; duration_min: number; title: string }

const SPORT: Record<string, string> = { swim: "Natação", bike: "Ciclismo", run: "Corrida", brick: "Brick", strength: "Força", other: "Treino" };

function addDays(d: string, n: number) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

function vals(rows: Map<string, WellnessRow>, key: keyof WellnessRow, from: string, to: string) {
  const out: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const v = rows.get(d)?.[key]; if (typeof v === "number" && Number.isFinite(v)) out.push(v); }
  return out;
}

export interface Digest { title: string; body: string; severity: "alert" | "warn" | "info"; rules: string[] }

export function dailyDigest(wellness: WellnessRow[], planned: PlannedRow[], today: string): Digest {
  const idx = new Map(wellness.map((w) => [w.day, w]));
  const rules: string[] = [];
  const lines: string[] = [];

  const hrv7 = vals(idx, "hrv", addDays(today, -6), today);
  const hrv60 = vals(idx, "hrv", addDays(today, -66), addDays(today, -7));
  const rhr60 = vals(idx, "rhr", addDays(today, -66), addDays(today, -7));
  let hrvLow = false, rhrHigh = false;
  if (hrv7.length >= 3 && hrv60.length >= 20) {
    const m = mean(hrv60), s = Math.max(sd(hrv60), m * 0.02);
    hrvLow = mean(hrv7) < m - s;
  }
  if (rhr60.length >= 20) {
    const base = mean(rhr60);
    rhrHigh = [0, 1].every((k) => (idx.get(addDays(today, -k))?.rhr ?? 0) >= base + 5);
  }
  if (hrvLow && rhrHigh) { rules.push("hrv_rhr_alert"); lines.push("HRV abaixo do normal e FC de repouso alta há 2 dias: possível doença ou sobretreino. Treino leve ou descanso."); }
  else if (hrvLow) { rules.push("hrv_low"); lines.push("HRV abaixo do normal: mantenha o treino fácil hoje."); }

  const short = [0, 1, 2].filter((k) => { const s = idx.get(addDays(today, -k))?.sleep_s; return typeof s === "number" && s < 6 * 3600; }).length;
  if (short >= 2) { rules.push("sleep_short"); lines.push(`${short} das últimas 3 noites com menos de 6 h: adie a sessão dura.`); }

  const plan = planned.length
    ? `Hoje: ${planned.map((p) => `${SPORT[p.sport] ?? p.sport} ${p.duration_min} min`).join(" + ")}${rules.length ? " (considere reduzir)" : ""}.`
    : "Hoje: sem treino planeado.";
  const severity: Digest["severity"] = rules.includes("hrv_rhr_alert") ? "alert" : rules.length ? "warn" : "info";
  const title = severity === "alert" ? "TriCoach · Atenção à recuperação" : severity === "warn" ? "TriCoach · Dia para ir com calma" : "TriCoach · Bom dia";
  return { title, body: [...lines, plan].join(" "), severity, rules };
}

/** Hora local (0–23) de uma data num fuso horário IANA. */
export function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
}
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
