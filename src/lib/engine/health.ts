import type { Activity, AthleteProfile, CheckIn, Sport, Suggestion, Wellness } from "../types";
import { SPORT_LABEL } from "../types";
import { addDays, diffDays, fmtDuration } from "../dates";
import { type LoadDay, dominantZone, zoneDistribution } from "./load";

export type WellnessKey = "hrv" | "rhr" | "sleepS" | "stressAvg" | "bbMorning" | "sleepScore";

export interface Baseline {
  mean7: number | null;
  mean60: number | null;
  sd60: number | null;
  low: number | null; // limite inferior da banda normal
  high: number | null;
}

function mean(xs: number[]) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function sd(xs: number[]) { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); }
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));

export function indexWellness(w: Wellness[]): Map<string, Wellness> {
  return new Map(w.map((x) => [x.date, x]));
}

function valuesBetween(idx: Map<string, Wellness>, key: WellnessKey, from: string, to: string): number[] {
  const out: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = idx.get(d)?.[key];
    if (v != null && isFinite(v)) out.push(v);
  }
  return out;
}

/** Base pessoal: média de 7 dias até `date` e banda normal (média ± 1 DP) dos 60 dias anteriores a esses 7. */
export function baseline(idx: Map<string, Wellness>, key: WellnessKey, date: string): Baseline {
  const last7 = valuesBetween(idx, key, addDays(date, -6), date);
  const prev60 = valuesBetween(idx, key, addDays(date, -66), addDays(date, -7));
  const mean7 = last7.length >= 3 ? mean(last7) : null;
  if (prev60.length < 20) return { mean7, mean60: null, sd60: null, low: null, high: null };
  const m = mean(prev60);
  const s = Math.max(sd(prev60), Math.abs(m) * 0.02);
  return { mean7, mean60: m, sd60: s, low: m - s, high: m + s };
}

export interface ReadinessComponent {
  key: "hrv" | "sleep" | "tsb" | "rhr" | "energy" | "feel";
  label: string;
  score: number | null;
  weight: number;
  detail: string;
  /** desvio relativo à base, para ordenar as razões */
  impact: number;
}

export interface Readiness {
  date: string;
  score: number | null;
  level: "green" | "amber" | "red" | "unknown";
  components: ReadinessComponent[];
}

export function readiness(
  date: string,
  idx: Map<string, Wellness>,
  load: LoadDay[],
  p: AthleteProfile,
  checkin?: CheckIn | null,
): Readiness {
  const w = idx.get(date);
  const comps: ReadinessComponent[] = [];

  // HRV
  const hb = baseline(idx, "hrv", date);
  if (hb.mean7 != null && hb.mean60 != null && hb.sd60) {
    const z = (hb.mean7 - hb.mean60) / hb.sd60;
    const pct = ((hb.mean7 - hb.mean60) / hb.mean60) * 100;
    comps.push({
      key: "hrv", label: "HRV", weight: p.weights.hrv, score: clamp(60 + z * 25), impact: z,
      detail: `HRV 7 dias ${hb.mean7.toFixed(0)} ms, ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs base (${hb.mean60.toFixed(0)} ms)`,
    });
  } else comps.push({ key: "hrv", label: "HRV", weight: p.weights.hrv, score: null, impact: 0, detail: "Sem HRV suficiente" });

  // Sono
  const s0 = w?.sleepS ?? null;
  const s3 = valuesBetween(idx, "sleepS", addDays(date, -2), date);
  if (s0 != null) {
    const target = p.sleepTargetH * 3600;
    const last = clamp((s0 / target) * 100);
    const avg3 = s3.length ? clamp((mean(s3) / target) * 100) : last;
    const score = w?.sleepScore != null ? last * 0.4 + avg3 * 0.3 + w.sleepScore * 0.3 : last * 0.6 + avg3 * 0.4;
    comps.push({
      key: "sleep", label: "Sono", weight: p.weights.sleep, score: clamp(score), impact: (s0 - target) / 3600,
      detail: `Sono ${fmtDuration(s0)}${w?.sleepScore != null ? ` (score ${w.sleepScore})` : ""}; média 3 noites ${fmtDuration(s3.length ? mean(s3) : s0)}`,
    });
  } else comps.push({ key: "sleep", label: "Sono", weight: p.weights.sleep, score: null, impact: 0, detail: "Sem dados de sono" });

  // TSB
  const ld = load.find((l) => l.date === date);
  if (ld) {
    const tsb = ld.tsb;
    const score = tsb > 25 ? clamp(100 - (tsb - 25) * 2) : clamp(((tsb + 30) / 45) * 100);
    comps.push({
      key: "tsb", label: "Frescura (TSB)", weight: p.weights.tsb, score, impact: tsb / 15,
      detail: `TSB ${tsb.toFixed(0)} (forma ${ld.ctl.toFixed(0)}, fadiga ${ld.atl.toFixed(0)})`,
    });
  }

  // FC repouso
  const rb = baseline(idx, "rhr", date);
  const rhr = w?.rhr ?? null;
  if (rhr != null && rb.mean60 != null) {
    const diff = rhr - rb.mean60;
    comps.push({
      key: "rhr", label: "FC repouso", weight: p.weights.rhr, score: clamp(75 - diff * 8), impact: -diff / 3,
      detail: `FC repouso ${rhr} bpm, ${diff >= 0 ? "+" : ""}${diff.toFixed(0)} vs base (${rb.mean60.toFixed(0)})`,
    });
  } else comps.push({ key: "rhr", label: "FC repouso", weight: p.weights.rhr, score: null, impact: 0, detail: "Sem FC de repouso" });

  // Energia: Body Battery + stress
  if (w?.bbMorning != null || w?.stressAvg != null) {
    const bb = w?.bbMorning ?? 60;
    const st = w?.stressAvg ?? 30;
    comps.push({
      key: "energy", label: "Body Battery / stress", weight: p.weights.energy, score: clamp(bb * 0.7 + (100 - st) * 0.3),
      impact: (bb - 60) / 20,
      detail: `Body Battery ao acordar ${w?.bbMorning ?? "–"}, stress médio ${w?.stressAvg ?? "–"}`,
    });
  }

  // Sensações (check-in subjetivo): energia, dores musculares (invertido), humor e motivação, 1–5 → 0–100
  if (checkin) {
    const v = (checkin.energy + (6 - checkin.soreness) + checkin.mood + checkin.motivation) / 4;
    comps.push({
      key: "feel", label: "Sensações", weight: p.weights.feel ?? 10, score: clamp(((v - 1) / 4) * 100), impact: (v - 3) / 1,
      detail: `Check-in: energia ${checkin.energy}/5, dores ${checkin.soreness}/5, humor ${checkin.mood}/5, motivação ${checkin.motivation}/5`,
    });
  }

  const valid = comps.filter((c) => c.score != null && c.weight > 0);
  const wsum = valid.reduce((s, c) => s + c.weight, 0);
  const score = wsum > 0 ? valid.reduce((s, c) => s + c.score! * c.weight, 0) / wsum : null;
  const level = score == null ? "unknown" : score >= 70 ? "green" : score >= 45 ? "amber" : "red";
  return { date, score: score == null ? null : Math.round(score), level, components: comps };
}

export interface Recommendation {
  title: string;
  detail: string;
  sport: Sport | null;
  durationMin: [number, number];
  zones: string;
  reasons: string[];
}

/** Proporção-alvo de tempo por modalidade para um triatleta de longa distância. */
const TARGET_SPLIT: Partial<Record<Sport, number>> = { swim: 0.2, bike: 0.48, run: 0.32 };

export function neglectedSport(acts: Activity[], date: string): Sport {
  const from = addDays(date, -7);
  const t: Partial<Record<Sport, number>> = {};
  let tot = 0;
  for (const a of acts) {
    if (a.date <= from || a.date > date) continue;
    if (a.sport === "swim" || a.sport === "bike" || a.sport === "run") {
      t[a.sport] = (t[a.sport] ?? 0) + a.durationS;
      tot += a.durationS;
    }
  }
  let best: Sport = "run", gap = -Infinity;
  for (const s of ["swim", "bike", "run"] as Sport[]) {
    const share = tot ? (t[s] ?? 0) / tot : 0;
    const g = TARGET_SPLIT[s]! - share;
    if (g > gap) { gap = g; best = s; }
  }
  return best;
}

export function recommend(r: Readiness, acts: Activity[], date: string): Recommendation {
  const reasons = [...r.components]
    .filter((c) => c.score != null)
    .sort((a, b) => (r.level === "green" ? b.impact - a.impact : a.impact - b.impact))
    .slice(0, 3)
    .map((c) => c.detail);
  const sport = neglectedSport(acts, date);
  const sp = SPORT_LABEL[sport].toLowerCase();
  if (r.level === "green")
    return { title: "Dia para qualidade", detail: `Pode fazer a sessão intensa planeada. Se não tiver plano: ${sp} com intervalos em Z4.`, sport, durationMin: [60, 90], zones: "Z2 + blocos Z4", reasons };
  if (r.level === "amber")
    return { title: "Aeróbio moderado", detail: `Evite intensidade. ${SPORT_LABEL[sport]} contínuo em Z2, cadência solta.`, sport, durationMin: [45, 75], zones: "Z1–Z2", reasons };
  if (r.level === "red")
    return { title: "Descanso ou recuperação ativa", detail: "Dia de descanso, ou 30–40 min muito fácil (nadar solto ou rolar). Priorize sono e alimentação.", sport: null, durationMin: [0, 40], zones: "Z1", reasons };
  return { title: "Dados insuficientes", detail: "Sincronize pelo menos 3 semanas de dados para obter recomendações.", sport: null, durationMin: [0, 0], zones: "–", reasons };
}

export interface RuleContext {
  date: string;
  acts: Activity[];
  idx: Map<string, Wellness>;
  load: LoadDay[];
  profile: AthleteProfile;
  nextRace?: { date: string; name: string; priority: "A" | "B" | "C" } | null;
}

/** Regras determinísticas da Fase 1. Cada regra devolve 0 ou 1 sugestão. */
export function evaluateRules(c: RuleContext): Suggestion[] {
  const out: Suggestion[] = [];
  const { date, idx, load, acts, profile } = c;
  const add = (s: Omit<Suggestion, "id" | "date">) => out.push({ ...s, id: `${s.rule}:${date}`, date });
  const L = (d: string) => load.find((l) => l.date === d);

  // 1. HRV abaixo da banda + FC repouso +5 bpm durante ≥2 dias
  const hb = baseline(idx, "hrv", date);
  const rb = baseline(idx, "rhr", date);
  if (hb.mean7 != null && hb.low != null && rb.mean60 != null && hb.mean7 < hb.low) {
    const days = [0, 1].filter((k) => (idx.get(addDays(date, -k))?.rhr ?? 0) >= rb.mean60! + 5).length;
    if (days === 2)
      add({ rule: "hrv_rhr_alert", severity: "alert", title: "Possível doença ou sobretreino",
        action: "Troque a intensidade por Z1–Z2 ou descanse. Se persistir mais de 3 dias, fale com um médico.",
        reason: `HRV 7 dias ${hb.mean7.toFixed(0)} ms abaixo da banda normal (${hb.low.toFixed(0)}–${hb.high!.toFixed(0)}) e FC de repouso +5 bpm há 2 dias.`,
        confidence: "alta", data: { hrv7: Math.round(hb.mean7), hrvLow: Math.round(hb.low), rhrBase: Math.round(rb.mean60) } });
    else
      add({ rule: "hrv_low", severity: "warn", title: "HRV abaixo do normal",
        action: "Mantenha o treino fácil hoje e reavalie amanhã.",
        reason: `HRV 7 dias ${hb.mean7.toFixed(0)} ms, abaixo da banda normal (${hb.low.toFixed(0)}–${hb.high!.toFixed(0)}).`,
        confidence: "média", data: { hrv7: Math.round(hb.mean7), hrvLow: Math.round(hb.low) } });
  }

  // 2. TSB < -30
  const today = L(date);
  if (today && today.tsb < -30)
    add({ rule: "tsb_low", severity: "warn", title: "Fadiga acumulada elevada",
      action: "Planeie uma semana de descarga: −30 a −40% de volume, mantendo 1 sessão curta de intensidade.",
      reason: `TSB em ${today.tsb.toFixed(0)} (limite −30).`, confidence: "alta", data: { tsb: Math.round(today.tsb) } });

  // 3. Rampa de CTL > 7/semana durante 2 semanas
  const w1 = L(addDays(date, -7)), w2 = L(addDays(date, -14));
  if (today && w1 && w2) {
    const r1 = today.ctl - w1.ctl, r2 = w1.ctl - w2.ctl;
    if (r1 > 7 && r2 > 7)
      add({ rule: "ramp_high", severity: "warn", title: "Carga a subir depressa",
        action: "Limite o aumento de carga a 5 pontos de CTL por semana para reduzir o risco de lesão.",
        reason: `CTL subiu ${r2.toFixed(1)} e ${r1.toFixed(1)} pontos nas últimas duas semanas.`, confidence: "média", data: { ramp: Number(r1.toFixed(1)) } });
  }

  // 4. Sono < 6h em 2 de 3 noites
  const short = [0, 1, 2].filter((k) => { const s = idx.get(addDays(date, -k))?.sleepS; return s != null && s < 6 * 3600; }).length;
  if (short >= 2)
    add({ rule: "sleep_short", severity: "warn", title: "Sono insuficiente",
      action: "Reduza ou adie a sessão dura de hoje e tente deitar-se 45 min mais cedo.",
      reason: `${short} das últimas 3 noites com menos de 6 h de sono.`, confidence: "alta", data: { nights: short } });

  // 5. Mais de 25% do tempo em Z3 nas últimas 4 semanas
  const zd = zoneDistribution(acts.filter((a) => a.sport !== "strength"), profile, addDays(date, -27), date);
  if (zd[2] > 25)
    add({ rule: "z3_heavy", severity: "info", title: "Treino pouco polarizado",
      action: "Torne os treinos fáceis mais fáceis (Z1–Z2) e concentre a intensidade em 2 sessões por semana.",
      reason: `${zd[2].toFixed(0)}% do tempo em Z3 nas últimas 4 semanas (referência: abaixo de 25%).`, confidence: "média", data: { z3: Math.round(zd[2]) } });

  // 6. Sem natação há ≥7 dias (com prova a <12 semanas)
  const lastSwim = acts.filter((a) => a.sport === "swim" && a.date <= date).reduce<string | null>((m, a) => (!m || a.date > m ? a.date : m), null);
  const raceSoon = c.nextRace ? diffDays(date, c.nextRace.date) <= 84 : true;
  if (raceSoon && (!lastSwim || diffDays(lastSwim, date) >= 7))
    add({ rule: "swim_gap", severity: "info", title: "Natação em falta",
      action: "Marque uma sessão de natação nos próximos 2 dias (técnica + 6×200 m em ritmo CSS).",
      reason: lastSwim ? `Última natação há ${diffDays(lastSwim, date)} dias.` : "Sem natação registada.", confidence: "alta" });

  // 7. Prova A daqui a 10–14 dias → taper
  if (c.nextRace && c.nextRace.priority === "A") {
    const dd = diffDays(date, c.nextRace.date);
    if (dd >= 10 && dd <= 14)
      add({ rule: "taper", severity: "info", title: `Iniciar taper para ${c.nextRace.name}`,
        action: "Reduza 40–60% do volume, mantendo estímulos curtos de intensidade.", reason: `Prova A daqui a ${dd} dias.`, confidence: "alta" });
  }

  // 8. Decoupling: proxy = FC média em longos aeróbios a subir para o mesmo ritmo (sem séries temporais na Fase 1)
  const longs = acts.filter((a) => a.sport === "run" && a.durationS >= 75 * 60 && a.avgHr && a.distanceM > 0 && a.date > addDays(date, -42) && a.date <= date);
  if (longs.length >= 3) {
    const eff = longs.map((a) => (a.distanceM / a.durationS) / a.avgHr!);
    const first = eff[0], last = eff[eff.length - 1];
    const drop = ((first - last) / first) * 100;
    if (drop > 5)
      add({ rule: "aerobic_eff", severity: "info", title: "Eficiência aeróbia a descer",
        action: "Mais volume em Z2 e verifique hidratação/calor nos treinos longos.",
        reason: `Velocidade por batimento caiu ${drop.toFixed(0)}% nos longos de corrida das últimas 6 semanas.`, confidence: "baixa" });
  }

  // 9. Treino longo > 2h30 ontem/hoje → hidratação
  const longToday = acts.find((a) => (a.date === date || a.date === addDays(date, -1)) && a.durationS > 150 * 60);
  if (longToday)
    add({ rule: "hydration", severity: "info", title: "Reposição após treino longo",
      action: "Reponha 500–750 ml por hora de treino com eletrólitos e hidratos nas 4 h seguintes.",
      reason: `${longToday.name}: ${fmtDuration(longToday.durationS)}.`, confidence: "média" });

  const order = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export { dominantZone };
