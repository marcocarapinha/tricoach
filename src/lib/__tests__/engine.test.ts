import { describe, it, expect } from "vitest";
import { addYears, isoWeek, addDays } from "../dates";
import { DEFAULT_PROFILE, type Activity } from "../types";
import { activityTss, loadSeries } from "../engine/load";
import { runStats, resolvePeriod, shiftRange, cumulative } from "../engine/stats";
import { readiness, indexWellness, evaluateRules, recommend } from "../engine/health";
import { generateDemo } from "../demo";

const P = DEFAULT_PROFILE;
const TODAY = "2026-11-13";

describe("datas", () => {
  it("addYears trata 29 de fevereiro", () => {
    expect(addYears("2024-02-29", -1)).toBe("2023-02-28");
    expect(addYears("2026-11-13", -3)).toBe("2023-11-13");
  });
  it("semana ISO", () => {
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2024-12-30")).toBe(1);
    expect(isoWeek("2026-11-13")).toBe(46);
  });
});

describe("carga", () => {
  it("TSS de 1 h ao FTP = 100", () => {
    const a: Activity = { id: "x", start: "", date: TODAY, sport: "bike", subSport: "road", name: "", durationS: 3600, distanceM: 35000, elevationM: 0, normPower: P.ftp };
    expect(Math.round(activityTss(a, P))).toBe(100);
  });
  it("CTL converge para a carga diária constante", () => {
    const acts: Activity[] = [];
    for (let i = 0; i < 400; i++) acts.push({ id: String(i), start: "", date: addDays(TODAY, -i), sport: "bike", subSport: "road", name: "", durationS: 3600, distanceM: 0, elevationM: 0, tss: 50 });
    const s = loadSeries(acts, P, addDays(TODAY, -10), TODAY);
    expect(s.at(-1)!.ctl).toBeGreaterThan(49);
    expect(Math.abs(s.at(-1)!.tsb)).toBeLessThan(1);
  });
});

describe("estatísticas", () => {
  const acts: Activity[] = [
    { id: "a", start: "", date: "2026-03-10", sport: "run", subSport: "road", name: "", durationS: 3000, distanceM: 10000, elevationM: 50 },
    { id: "b", start: "", date: "2026-03-12", sport: "run", subSport: "road", name: "", durationS: 2400, distanceM: 8000, elevationM: 20 },
    { id: "c", start: "", date: "2025-03-10", sport: "run", subSport: "road", name: "", durationS: 3300, distanceM: 10000, elevationM: 50 },
    { id: "d", start: "", date: "2025-12-10", sport: "run", subSport: "road", name: "", durationS: 3300, distanceM: 10000, elevationM: 50 },
    { id: "e", start: "", date: "2026-03-11", sport: "bike", subSport: "road", name: "", durationS: 7200, distanceM: 60000, elevationM: 500 },
  ];
  it("YTD corta N-1 no mesmo dia do ano", () => {
    const r = resolvePeriod({ kind: "ytd" }, TODAY);
    expect(r).toEqual({ from: "2026-01-01", to: TODAY });
    expect(shiftRange(r, 1)).toEqual({ from: "2025-01-01", to: "2025-11-13" });
  });
  it("soma por modalidade e mês, com N-1 e N-2 sem dados", () => {
    const res = runStats(acts, [], { period: { kind: "ytd" }, compare: [1, 2], groupBy: ["sport", "month"], metrics: ["distance", "pace"] }, P, TODAY);
    const run = res.rows.find((r) => r.key === "run")!;
    expect(run.values.distance[0]).toBe(18);
    expect(run.values.distance[1]).toBe(10); // dezembro de 2025 fica fora do YTD homólogo
    expect(res.empty[2]).toBe(true);
    expect(run.values.distance[2]).toBeNull();
    // ritmo ponderado: 5400 s / 18 km = 300 s/km
    expect(run.values.pace[0]).toBe(300);
    expect(run.children!.map((c) => c.key)).toEqual(["3"]);
    expect(res.total.distance[0]).toBe(78);
  });
  it("acumulado pára em hoje no ano atual", () => {
    const c = cumulative(acts, "distance", { period: { kind: "ytd" }, compare: [1] }, P, TODAY);
    expect(c.points.at(-1)!.y0).toBeNull();
    expect(c.points.at(-1)!.y1).toBe(20);
  });
});

describe("demo + regras", () => {
  const demo = generateDemo(P, TODAY);
  it("gera 4 anos de dados", () => {
    expect(demo.wellness.length).toBeGreaterThan(1460);
    expect(demo.activities.length).toBeGreaterThan(1500);
  });
  it("cenário de hoje dispara alerta e baixa a prontidão", () => {
    const idx = indexWellness(demo.wellness);
    const load = loadSeries(demo.activities, P, addDays(TODAY, -60), TODAY);
    const r = readiness(TODAY, idx, load, P);
    const sug = evaluateRules({ date: TODAY, acts: demo.activities, idx, load, profile: P, nextRace: demo.nextRace });
    const rec = recommend(r, demo.activities, TODAY);
    console.log(r.score, r.level, rec.title, sug.map((s) => s.rule));
    expect(r.level).not.toBe("green");
    expect(sug.some((s) => s.rule === "hrv_rhr_alert" || s.rule === "hrv_low")).toBe(true);
  });
  it("volume anual cresce face a N-3", () => {
    const res = runStats(demo.activities, demo.wellness, { period: { kind: "ytd" }, compare: [1, 2, 3], groupBy: ["sport"], metrics: ["duration", "hrv"] }, P, TODAY);
    console.log(Object.entries(res.total.duration).map(([k, v]) => `${k}:${(v as number).toFixed(0)}h`).join(" "), res.total.hrv);
    expect(res.total.duration[0]!).toBeGreaterThan(res.total.duration[3]!);
  });
});
