import { describe, it, expect } from "vitest";
import { EXERCISES, AREAS, buildRoutine, weekSuggestions, classifyDay, routineToSession, type FunctionalProfile } from "../engine/functional";
import { encodeWorkoutFit, fitCrc } from "../engine/fit-workout";
import type { PlannedSession } from "../types";

const prof: FunctionalProfile = { areas: ["achilles", "hamstrings"], level: "intermediate", equipment: ["band", "step"] };
const ses = (date: string, sport: PlannedSession["sport"], type: PlannedSession["type"], durationMin = 60): PlannedSession => ({ id: date + sport + type, date, sport, type, durationMin, title: "" });

describe("biblioteca funcional", () => {
  it("todas as zonas têm exercícios para iniciantes só com peso corporal ou elástico", () => {
    for (const a of AREAS) {
      const ok = EXERCISES.filter((e) => e.areas.includes(a.id) && e.level === "beginner" && e.equipment.every((q) => q === "band"));
      expect(ok.length, a.id).toBeGreaterThan(0);
    }
  });
  it("ids únicos e doses para os três níveis", () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) expect(Object.keys(e.dose)).toEqual(["beginner", "intermediate", "advanced"]);
  });
});

describe("rotina", () => {
  it("completa: aquecimento + 2 por zona + core, 20–40 min, só com o material disponível", () => {
    const r = buildRoutine(prof, "2026-11-15", "full");
    expect(r.items.filter((i) => i.area === "achilles").length).toBe(2);
    expect(r.items.filter((i) => i.area === "hamstrings").length).toBe(2);
    expect(r.items.some((i) => i.area === "core")).toBe(true);
    expect(r.minutes).toBeGreaterThanOrEqual(20);
    expect(r.minutes).toBeLessThanOrEqual(40);
    expect(r.items.every((i) => i.exercise.equipment.every((q) => prof.equipment.includes(q as any)))).toBe(true);
    expect(r.items.some((i) => i.exercise.id === "nordic")).toBe(false); // Nordic exige apoio e nível avançado
  });
  it("na véspera de corrida dura evita excêntricos pesados", () => {
    for (const date of ["2026-11-15", "2026-11-17", "2026-11-19"]) {
      const r = buildRoutine(prof, date, "full", { avoidHeavy: true });
      expect(r.items.some((i) => i.exercise.kind === "heavy")).toBe(false);
      expect(r.note).toMatch(/excêntricos/);
    }
  });
  it("até 4 zonas: 2 exercícios nas duas primeiras, 1 nas outras, sem passar de ~40 min", () => {
    const four: FunctionalProfile = { areas: ["achilles", "hamstrings", "knee", "shoulders", "hip"], level: "intermediate", equipment: ["band", "step"] };
    const r = buildRoutine(four, "2026-11-15", "full");
    expect(r.areas).toEqual(["achilles", "hamstrings", "knee", "shoulders"]);
    expect(["achilles", "hamstrings", "knee", "shoulders"].map((a) => r.items.filter((i) => i.area === a).length)).toEqual([2, 2, 1, 1]);
    expect(r.minutes).toBeLessThanOrEqual(42);
  });
  it("varia entre sessões e mobilidade é curta", () => {
    const a = buildRoutine(prof, "2026-11-15", "full").items.map((i) => i.exercise.id).join();
    const b = buildRoutine(prof, "2026-11-17", "full").items.map((i) => i.exercise.id).join();
    expect(a).not.toBe(b);
    const m = buildRoutine(prof, "2026-11-15", "mobility");
    expect(m.minutes).toBeLessThanOrEqual(14);
    expect(m.items.filter((i) => i.exercise.kind === "mobility").length).toBeGreaterThanOrEqual(2);
  });
  it("vira sessão planeada exportável para FIT", () => {
    const s = routineToSession(buildRoutine(prof, "2026-11-15", "full"));
    expect(s.sport).toBe("strength");
    expect(s.type).toBe("functional");
    expect(s.title).toBe("Funcional · Tendão, Posterior");
    expect(fitCrc(encodeWorkoutFit(s))).toBe(0);
  });
});

describe("encaixe na semana", () => {
  // semana de 16 nov 2026 (seg): seg descanso, ter séries bici, qua corrida fácil, qui descanso, sex natação, sáb longo bici, dom longo corrida
  const planned = [ses("2026-11-17", "bike", "intervals", 75), ses("2026-11-18", "run", "endurance", 50), ses("2026-11-20", "swim", "technique", 45), ses("2026-11-21", "bike", "long", 180), ses("2026-11-22", "run", "long", 100)];
  it("classifica os dias", () => {
    expect(classifyDay([], false)).toBe("rest");
    expect(classifyDay([ses("x", "run", "endurance", 50)], false)).toBe("easy");
    expect(classifyDay([ses("x", "run", "endurance", 120)], false)).toBe("hard");
    expect(classifyDay([ses("x", "bike", "intervals")], false)).toBe("hard");
  });
  it("rotina completa nos descansos, nunca em dias seguidos, nada nos duros", () => {
    const w = weekSuggestions(planned, [], "2026-11-16");
    expect(w.map((x) => x.mode)).toEqual(["full", null, null, "full", null, null, null]); // qua e sex encostam à qui
    expect(w[3].avoidHeavy).toBe(false);
  });
  it("com só um dia de descanso, completa com rotina curta num dia leve", () => {
    const busy = [...planned, ses("2026-11-19", "swim", "endurance", 45)];
    const w = weekSuggestions(busy, [], "2026-11-16");
    expect(w.map((x) => x.mode)).toEqual(["full", null, "short", null, "short", null, null]);
  });
  it("véspera de prova fica livre e véspera de longo de corrida evita excêntricos", () => {
    const w = weekSuggestions([...planned, ses("2026-11-19", "run", "intervals")], ["2026-11-17"], "2026-11-16");
    expect(w[0].mode).toBeNull(); // véspera de prova
    expect(w[0].reason).toMatch(/Véspera de prova/);
    expect(w[1].kind).toBe("race");
    const w2 = weekSuggestions([ses("2026-11-17", "run", "intervals")], [], "2026-11-16");
    expect(w2[0].avoidHeavy).toBe(true);
  });
});
