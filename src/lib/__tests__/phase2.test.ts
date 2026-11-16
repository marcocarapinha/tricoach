import { describe, it, expect } from "vitest";
import FitParser from "fit-file-parser";
import { DEFAULT_PROFILE, type Activity, type ActivityStreams, type PlannedSession, type Race } from "../types";
import { buildSeason, phaseOn, weekTarget, nextRace } from "../engine/periodization";
import { generateWeek, matchWeek, weekCompliance, plannedTss, buildSteps } from "../engine/plan";
import { computeBests, powerCurve, prsIn } from "../engine/bests";
import { normalizedPower, decoupling, similarActivities } from "../engine/analysis";
import { encodeWorkoutFit, fitCrc } from "../engine/fit-workout";
import { readiness, indexWellness } from "../engine/health";

const P = DEFAULT_PROFILE;
const race = (id: string, date: string, priority: "A" | "B" | "C", distance: Race["distance"] = "half"): Race => ({ id, date, name: id, priority, distance });

describe("periodização", () => {
  const races = [race("im70", "2027-06-20", "A"), race("oly", "2027-05-09", "B", "olympic")];
  const segs = buildSeason(races, "2026-11-14", "2027-09-30");
  it("encadeia base → construção → pico → taper → prova → recuperação", () => {
    expect(segs.map((s) => s.phase)).toEqual(["base", "build", "peak", "taper", "race", "recovery", "transition", "base"]);
    expect(phaseOn(segs, "2027-06-20")?.phase).toBe("race");
    expect(phaseOn(segs, "2027-06-10")?.phase).toBe("taper"); // 12 dias de taper no 70.3
    expect(phaseOn(segs, "2027-05-25")?.phase).toBe("peak");
  });
  it("segmentos contíguos sem buracos", () => {
    for (let i = 1; i < segs.length; i++) expect(segs[i].from > segs[i - 1].to).toBe(true);
  });
  it("alvo semanal desce no taper e na semana de prova B", () => {
    const build = weekTarget(segs, races, "2027-03-01", 70);
    const taper = weekTarget(segs, races, "2027-06-14", 70);
    const bWeek = weekTarget(segs, races, "2027-05-03", 70);
    expect(taper.tss).toBeLessThan(build.tss);
    expect(bWeek.bRace?.id).toBe("oly");
  });
  it("próxima prova", () => {
    expect(nextRace(races, "2027-05-10")?.id).toBe("im70");
  });
});

describe("plano semanal", () => {
  const target = { weekStart: "2026-11-16", phase: "build" as const, recoveryWeek: false, tss: 600, hours: 10 };
  const week = generateWeek(target, P);
  it("TSS planeado perto do alvo e passos válidos", () => {
    const total = week.reduce((s, x) => s + (x.tss ?? 0), 0);
    expect(Math.abs(total - 600) / 600).toBeLessThan(0.12);
    expect(week.every((s) => s.steps && s.steps.length >= 1)).toBe(true);
    expect(new Set(week.map((s) => s.sport))).toEqual(new Set(["swim", "bike", "run"]));
  });
  it("prova e véspera ficam livres", () => {
    const w = generateWeek({ ...target, phase: "taper" }, P, ["2026-11-22"]);
    expect(w.some((s) => s.date === "2026-11-22" || s.date === "2026-11-21")).toBe(false);
  });
  it("intervalos de bicicleta com alvos de potência a partir do FTP", () => {
    const steps = buildSteps("bike", "intervals", 75, P);
    const rep = steps.find((s) => s.kind === "repeat")!;
    expect(rep.kind === "repeat" && rep.steps[0].target).toEqual({ type: "power", low: Math.round(260 * 0.91), high: Math.round(260 * 1.05) });
  });
  it("planeado vs realizado", () => {
    const planned: PlannedSession[] = [
      { id: "p1", date: "2026-11-16", sport: "run", type: "endurance", durationMin: 60, title: "a", tss: plannedTss("run", "endurance", 60) },
      { id: "p2", date: "2026-11-17", sport: "bike", type: "intervals", durationMin: 90, title: "b" },
      { id: "p3", date: "2026-11-18", sport: "swim", type: "endurance", durationMin: 45, title: "c" },
      { id: "p4", date: "2026-11-20", sport: "run", type: "long", durationMin: 90, title: "d" },
    ];
    const act = (id: string, date: string, sport: Activity["sport"], min: number): Activity => ({ id, date, start: "", sport, subSport: "road", name: id, durationS: min * 60, distanceM: 10000, elevationM: 0 });
    const { matches, unplanned } = matchWeek(planned, [act("a1", "2026-11-16", "run", 58), act("a2", "2026-11-17", "bike", 40), act("a3", "2026-11-19", "swim", 30)], "2026-11-19");
    expect(matches.map((m) => m.status)).toEqual(["done", "partial", "missed", "planned"]);
    expect(unplanned.map((a) => a.id)).toEqual(["a3"]);
    const c = weekCompliance(matches, unplanned, P);
    expect(c.sessionsDone).toBe(1);
    expect(c.sessionsDue).toBe(3);
    expect(c.volumePct).toBe(Math.round(((58 + 40) / (60 + 90 + 45)) * 100));
  });
});

describe("recordes", () => {
  const a = (id: string, date: string, bests: Record<string, number>, sport: Activity["sport"] = "run"): Activity => ({ id, date, start: "", sport, subSport: "road", name: id, durationS: 3600, distanceM: 10000, elevationM: 0, bests });
  const acts = [a("x1", "2025-03-01", { fastestSplit_5000: 1260 }), a("x2", "2026-04-01", { fastestSplit_5000: 1235 }), a("b1", "2026-05-01", { maxAvgPower_1200: 275, maxAvgPower_60: 410 }, "bike")];
  it("melhor no geral e por ano", () => {
    const { allTime, byYear } = computeBests(acts);
    expect(allTime.fastestSplit_5000.value).toBe(1235);
    expect(byYear[2025].fastestSplit_5000.value).toBe(1260);
    expect(allTime.maxAvgPower_1200.value).toBe(275);
  });
  it("curva de potência e PR numa atividade", () => {
    expect(powerCurve(acts).find((p) => p.duration === 60)?.watts).toBe(410);
    expect(prsIn(acts[1], acts).map((d) => d.key)).toEqual(["fastestSplit_5000"]);
    expect(prsIn(acts[0], acts).map((d) => d.key)).toEqual(["fastestSplit_5000"]); // era PR na altura
  });
});

describe("análise de atividade", () => {
  it("NP de potência constante = essa potência; NP de intervalos > média", () => {
    expect(normalizedPower(new Array(120).fill(200), 5)).toBe(200);
    const intervals = Array.from({ length: 240 }, (_, i) => (Math.floor(i / 12) % 2 ? 320 : 120));
    const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    expect(normalizedPower(intervals, 5)!).toBeGreaterThan(avg);
  });
  it("desacoplamento: FC a derivar com ritmo constante", () => {
    const n = 200;
    const s: ActivityStreams = { activityId: "a", sampleS: 5, t: Array.from({ length: n }, (_, i) => i * 5), speed: new Array(n).fill(3.3), hr: Array.from({ length: n }, (_, i) => 140 + (i / n) * 14), laps: [] };
    const d = decoupling(s)!;
    expect(d.basis).toBe("speed");
    expect(d.pct).toBeGreaterThan(4);
    expect(d.pct).toBeLessThan(6);
  });
  it("semelhantes: mesma modalidade/tipo e duração ±25%", () => {
    const base = { start: "", subSport: "road", name: "", distanceM: 0, elevationM: 0 };
    const a: Activity = { ...base, id: "a", date: "2026-11-10", sport: "run", durationS: 3600, sessionType: "long" };
    const others: Activity[] = [
      { ...base, id: "b", date: "2026-10-01", sport: "run", durationS: 3900, sessionType: "long" },
      { ...base, id: "c", date: "2026-10-02", sport: "run", durationS: 6000, sessionType: "long" },
      { ...base, id: "d", date: "2026-10-03", sport: "bike", durationS: 3600, sessionType: "long" },
    ];
    expect(similarActivities(a, [a, ...others]).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("FIT de treino", () => {
  const session: PlannedSession = { id: "s", date: "2026-11-17", sport: "bike", type: "intervals", durationMin: 75, title: "Ciclismo · Intervalos", steps: buildSteps("bike", "intervals", 75, P) };
  const bytes = encodeWorkoutFit(session, Date.UTC(2026, 10, 14));
  it("cabeçalho e CRC válidos", () => {
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe(".FIT");
    expect(fitCrc(bytes)).toBe(0); // CRC sobre ficheiro + CRC = 0
  });
  it("é lido por um parser FIT independente", async () => {
    const parser = new FitParser({ force: false, mode: "list" });
    const data: any = await new Promise((res, rej) => parser.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer, (err: any, d: any) => (err ? rej(err) : res(d))));
    expect(data.file_ids[0].type).toBe("workout");
    expect(data.workout).toMatchObject({ sport: "cycling", wkt_name: "Ciclismo · Intervalos", num_valid_steps: 5 }); // aquecimento, forte, recuperação, repetir, retorno
    // o parser em modo lista guarda só o último passo: o retorno em Z1 (40–55% FTP), em W + 1000
    expect(data.workout_step).toMatchObject({ wkt_step_name: "Retorno", duration_type: "time", target_type: "power", intensity: "cooldown",
      custom_target_value_low: 1000 + Math.round(260 * 0.4), custom_target_value_high: 1000 + Math.round(260 * 0.55) });
  });
});

describe("check-in na prontidão", () => {
  it("adiciona o componente Sensações", () => {
    const r = readiness("2026-11-14", indexWellness([]), [], P, { date: "2026-11-14", energy: 5, soreness: 1, mood: 5, motivation: 5 });
    const feel = r.components.find((c) => c.key === "feel")!;
    expect(feel.score).toBe(100);
    expect(r.score).toBe(100); // único componente com dados
  });
});
