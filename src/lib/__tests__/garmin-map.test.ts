import { describe, it, expect } from "vitest";
import { buildUrl, mapSport, mapWellness, prepareActivities, windows } from "../../../supabase/functions/_shared/garmin-map.ts";

// Exemplos construídos a partir dos `example` do Swagger oficial (OpenAPI 3.0.1, v1.0.0)
const base = { startTimeLocal: "2026-08-31 17:01:18", startTimeGMT: "2026-08-31 16:01:18", duration: 2400.93, distance: 10000, elevationGain: 42, averageHR: 151, maxHR: 176, calories: 610,
  hrTimeInZone_1: 6.001, hrTimeInZone_2: 30, hrTimeInZone_3: 793.001, hrTimeInZone_4: 1120.344, hrTimeInZone_5: 446.603 };
const B = "https://personal.connectapi.garmin.com";

describe("Garmin Personal API · pedidos", () => {
  it("datas na query ou no caminho conforme o endpoint", () => {
    expect(buildUrl(B, "sleep", "2026-01-01", "2026-01-31")).toBe(`${B}/sleep-service/sleep/dailySleepSummariesByDate?startDate=2026-01-01&endDate=2026-01-31`);
    expect(buildUrl(B, "hrv", "2026-01-01", "2026-01-28")).toBe(`${B}/hrv-service/hrv/daily/2026-01-01/2026-01-28`);
    expect(buildUrl(B, "dailySummaries", "2025-01-01", "2025-12-31")).toContain("/usersummary-service/v2/dailysummaries?startDate=2025-01-01&endDate=2025-12-31");
    expect(buildUrl(B, "activities", "2026-01-01", "2026-01-31", { start: 0, limit: 100, excludeChildren: false })).toContain("excludeChildren=false");
  });
  it("janelas respeitam o máximo de dias", () => {
    const w = windows("2026-01-01", "2026-03-31", 31);
    expect(w).toEqual([["2026-01-01", "2026-01-31"], ["2026-02-01", "2026-03-03"], ["2026-03-04", "2026-03-31"]]);
  });
});

describe("Garmin Personal API · atividades", () => {
  it("mapeia typeKey para modalidade", () => {
    expect(mapSport("lap_swimming")).toEqual({ sport: "swim", sub: "pool" });
    expect(mapSport("open_water_swimming")).toEqual({ sport: "swim", sub: "open_water" });
    expect(mapSport("virtual_ride")).toEqual({ sport: "bike", sub: "indoor" });
    expect(mapSport("road_biking")).toEqual({ sport: "bike", sub: "road" });
    expect(mapSport("trail_running")).toEqual({ sport: "run", sub: "trail" });
    expect(mapSport("strength_training")).toEqual({ sport: "strength", sub: "gym" });
    expect(mapSport("multi_sport")).toEqual({ sport: "brick", sub: "race" });
  });
  it("SummarizedActivityDTO → activities", () => {
    const [r] = prepareActivities([{ ...base, activityId: 1, activityName: "Tempo run", activityType: { typeKey: "running" }, eventType: { typeKey: "training" }, avgPower: 290, normPower: 305, trainingStressScore: 64.2 }], "u1");
    expect(r).toMatchObject({ garmin_id: "1", sport: "run", sub_sport: "road", activity_date: "2026-08-31", start_time: "2026-08-31T16:01:18.000Z",
      duration_s: 2401, distance_m: 10000, elevation_m: 42, avg_hr: 151, max_hr: 176, avg_power: 290, norm_power: 305, tss: 64.2, session_type: null });
    expect(r.zone_seconds).toEqual([6, 30, 793, 1120, 447]);
  });
  it("triatlo: descarta a mãe, mantém as pernas marcadas como prova", () => {
    const rows = prepareActivities([
      { ...base, activityId: 10, activityName: "Meio Ironman", isParent: true, activityType: { typeKey: "multi_sport" }, eventType: { typeKey: "race" } },
      { ...base, activityId: 11, parentId: 10, activityName: "Natação", activityType: { typeKey: "open_water_swimming" }, eventType: { typeKey: "uncategorized" } },
      { ...base, activityId: 12, parentId: 10, activityName: "Ciclismo", activityType: { typeKey: "road_biking" } },
      { ...base, activityId: 12, parentId: 10, activityName: "Ciclismo", activityType: { typeKey: "road_biking" } }, // duplicado entre páginas
    ], "u1");
    expect(rows.map((r) => [r.garmin_id, r.sport, r.session_type])).toEqual([["11", "swim", "race"], ["12", "bike", "race"]]);
    expect(rows[0].name).toBe("Meio Ironman · Natação");
  });
});

describe("Garmin Personal API · saúde", () => {
  it("UserDailySummaryV2DTO → rhr, stress, Body Battery, passos, hidratação", () => {
    const p = mapWellness("dailySummaries", [{ calendarDate: "2023-10-09", heartRate: { restingValue: 48 }, stress: { avgLevel: 31 },
      bodyBattery: { maxValue: 85, minValue: 10 }, movement: { steps: { value: 5000, goal: 10000 } }, hydration: { consumedInFractionalMl: 1000.4321 } }]);
    expect(p["2023-10-09"]).toMatchObject({ rhr: 48, stress_avg: 31, bb_morning: 85, steps: 5000, hydration_ml: 1000 });
  });
  it("DailySleepDTO → sono e score geral", () => {
    const p = mapWellness("sleep", [
      { calendarDate: "2026-11-12", sleepTimeSeconds: 26100, deepSleepSeconds: 4800, lightSleepSeconds: 14400, remSleepSeconds: 6000, awakeSleepSeconds: 900, sleepScores: { overall: { value: 81, qualifierKey: "GOOD" } } },
      { calendarDate: "2026-11-13", sleepTimeSeconds: 0 },
    ]);
    expect(p["2026-11-12"]).toMatchObject({ sleep_s: 26100, sleep_score: 81, deep_s: 4800, rem_s: 6000 });
    expect(p["2026-11-13"]).toBeUndefined();
  });
  it("HrvSummaryDTO → HRV da noite", () => {
    const p = mapWellness("hrv", [{ calendarDate: "2026-11-13", lastNightAvg: 57, weeklyAvg: 63, status: "UNBALANCED" }]);
    expect(p["2026-11-13"].hrv).toBe(57);
  });
});

import { parseTokenResponse } from "../../../supabase/functions/_shared/garmin-map.ts";

describe("Garmin Personal API · token", () => {
  const now = Date.parse("2026-11-14T19:00:00Z");
  it("JSON com access_token e expires_in", () => {
    expect(parseTokenResponse('{"access_token":"abc.def","expires_in":3600}', now)).toEqual({ token: "abc.def", expiresAt: "2026-11-14T20:00:00.000Z" });
  });
  it("texto simples", () => {
    expect(parseTokenResponse("  plain-token_123  ", now).token).toBe("plain-token_123");
  });
  it("string JSON", () => {
    expect(parseTokenResponse('"tok"', now).token).toBe("tok");
  });
  it("JWT: expiração a partir de exp", () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${b64({ alg: "RS256" })}.${b64({ exp: 1794700800 })}.sig`;
    expect(parseTokenResponse(jwt, now).expiresAt).toBe(new Date(1794700800 * 1000).toISOString());
  });
  it("resposta inválida dá erro claro", () => {
    expect(() => parseTokenResponse("<html>erro</html>", now)).toThrow(/não reconhecida/);
  });
});

import { extractBests, fitToStreams } from "../../../supabase/functions/_shared/garmin-map.ts";

describe("Garmin · recordes e ficheiro FIT", () => {
  it("extrai fastestSplit_* e maxAvgPower_* do SummarizedActivityDTO", () => {
    const [r] = prepareActivities([{ activityId: 7, startTimeGMT: "2026-05-01 07:00:00", startTimeLocal: "2026-05-01 08:00:00", activityType: { typeKey: "running" },
      fastestSplit_1000: 221.4, fastestSplit_5000: 1189.03, fastestSplit_42195: null, maxAvgPower_60: 0, averageHR: 160 }], "u1");
    expect(r.bests).toEqual({ fastestSplit_1000: 221.4, fastestSplit_5000: 1189.03 });
    expect(extractBests({ averageHR: 150 })).toBeNull();
  });
  it("reamostra registos FIT a 5 s e lê voltas", () => {
    const t0 = Date.parse("2026-11-10T07:00:00Z");
    const records = Array.from({ length: 30 }, (_, i) => ({ timestamp: new Date(t0 + i * 1000), heart_rate: 140 + (i % 5), power: i < 10 ? 200 : 250, speed: 9.5, distance: i * 9.5, altitude: 50 }));
    const laps = [{ start_time: new Date(t0), total_timer_time: 15, total_distance: 142, avg_heart_rate: 142, avg_power: 217 }, { start_time: new Date(t0 + 15000), total_timer_time: 15, total_distance: 143, avg_heart_rate: 142, avg_power: 250 }];
    const out = fitToStreams({ records, laps }, 5);
    expect(out.streams.t).toEqual([0, 5, 10, 15, 20, 25]);
    expect(out.streams.power.slice(0, 3)).toEqual([200, 200, 250]);
    expect(out.streams.hr[0]).toBe(142);
    expect(out.streams.cadence).toEqual([]); // sem dados → vazio
    expect(out.laps[1]).toMatchObject({ index: 2, startS: 15, durationS: 15, distanceM: 143, avgPower: 250 });
  });
});
