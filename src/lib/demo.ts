// Gerador determinístico de 4 anos de dados de um triatleta, para o modo demo.
import type { Activity, ActivityStreams, AthleteProfile, CheckIn, Race, SessionType, Sport, Wellness } from "./types";
import { addDays, dayRange, diffDays, month, todayISO, weekday, year } from "./dates";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type TrainType = Exclude<SessionType, "functional">;
interface Plan { sport: Sport; type: TrainType; min: number; sub?: string }

const SEASON: Record<number, number> = { 1: 0.8, 2: 0.85, 3: 0.95, 4: 1.0, 5: 1.05, 6: 1.1, 7: 1.1, 8: 1.05, 9: 0.95, 10: 0.6, 11: 0.7, 12: 0.75 };

function template(wd: number, m: number, rnd: () => number): Plan[] {
  const winter = m >= 11 || m <= 2;
  const summer = m >= 5 && m <= 9;
  switch (wd) {
    case 0: return [{ sport: "swim", type: rnd() < 0.5 ? "technique" : "intervals", min: 50, sub: "pool" }];
    case 1: return [{ sport: "bike", type: "intervals", min: 75, sub: winter ? "indoor" : "road" }, { sport: "run", type: "recovery", min: 35 }];
    case 2: return [{ sport: "swim", type: "endurance", min: 60, sub: summer && rnd() < 0.4 ? "open_water" : "pool" }, { sport: "run", type: rnd() < 0.5 ? "tempo" : "intervals", min: 55, sub: rnd() < 0.3 ? "track" : "road" }];
    case 3: return [{ sport: "bike", type: "endurance", min: 90, sub: winter ? "indoor" : "road" }];
    case 4: return rnd() < 0.5 ? [{ sport: "swim", type: "intervals", min: 45, sub: "pool" }, { sport: "strength", type: "endurance", min: 40, sub: "gym" }] : [{ sport: "swim", type: "endurance", min: 50, sub: "pool" }];
    case 5: return summer && rnd() < 0.45
      ? [{ sport: "bike", type: "long", min: 180, sub: "road" }, { sport: "run", type: "tempo", min: 25, sub: "road" }]
      : [{ sport: "bike", type: "long", min: winter ? 150 : 210, sub: winter && rnd() < 0.3 ? "indoor" : "road" }];
    case 6: return [{ sport: "run", type: "long", min: 90, sub: rnd() < 0.25 ? "trail" : "road" }];
  }
  return [];
}

const RACES = [
  { m: 5, d: 12, name: "Triatlo Olímpico (B)", parts: [{ sport: "swim", km: 1.5 }, { sport: "bike", km: 40 }, { sport: "run", km: 10 }] },
  { m: 6, d: 22, name: "Meio Ironman (A)", parts: [{ sport: "swim", km: 1.9 }, { sport: "bike", km: 90 }, { sport: "run", km: 21.1 }] },
  { m: 9, d: 14, name: "Triatlo Sprint (C)", parts: [{ sport: "swim", km: 0.75 }, { sport: "bike", km: 20 }, { sport: "run", km: 5 }] },
] as const;

export interface DemoData { activities: Activity[]; wellness: Wellness[]; profile: AthleteProfile; nextRace: { date: string; name: string; priority: "A" | "B" | "C" } }

export function generateDemo(profile: AthleteProfile, today = todayISO()): DemoData {
  const start = addDays(today, -(4 * 365 + 30));
  const rnd = mulberry32(20261113);
  const acts: Activity[] = [];
  const wellness: Wellness[] = [];
  let ctl = 45, atl = 45, n = 0;

  for (const d of dayRange(start, today)) {
    const yearsBack = diffDays(d, today) / 365;
    const growth = 1 - 0.07 * yearsBack; // +7%/ano de volume
    const ftp = profile.ftp - 12 * yearsBack;
    const thr = profile.runThresholdPace + 9 * yearsBack;
    const css = profile.css + 3 * yearsBack;
    const m = month(d), wd = weekday(d);
    const weekIdx = Math.floor(diffDays(start, d) / 7);
    const recoveryWeek = weekIdx % 4 === 3;
    const vol = SEASON[m] * growth * (recoveryWeek ? 0.68 : 1);
    let dayTss = 0;

    const race = RACES.find((r) => r.m === m && r.d === Number(d.slice(8)));
    const plans: Plan[] = race ? [] : rnd() < 0.08 ? [] : template(wd, m, rnd);

    if (race) {
      let tot = 0;
      for (const part of race.parts) {
        const spd = part.sport === "swim" ? 100 / (css * 0.97) * 1000 / 1000 : part.sport === "bike" ? (30 + (ftp - 230) / 10) / 3.6 : 1000 / (thr * (race.name.includes("Meio") ? 1.07 : 1.0));
        tot += (part.km * 1000) / (part.sport === "swim" ? (100 / (css * 0.97)) : spd);
      }
      const durationS = Math.round(tot);
      const distanceM = race.parts.reduce((s, x) => s + x.km * 1000, 0);
      const IF = race.name.includes("Meio") ? 0.84 : race.name.includes("Sprint") ? 0.98 : 0.92;
      acts.push({
        id: `demo-${++n}`, start: `${d}T08:00:00Z`, date: d, sport: "brick", subSport: "race", name: race.name,
        durationS, distanceM, elevationM: race.name.includes("Meio") ? 820 : 300, avgHr: Math.round(profile.lthr * (IF + 0.02)), maxHr: Math.round(profile.hrMax * 0.97),
        avgPower: null, normPower: null, calories: Math.round(durationS / 3600 * 780), tss: Math.round(durationS / 3600 * IF * IF * 100),
        zoneSeconds: zones(durationS, IF > 0.9 ? [0.03, 0.12, 0.3, 0.45, 0.1] : [0.05, 0.25, 0.45, 0.22, 0.03]), gear: "Bicicleta TT", sessionType: "race",
      });
      dayTss += durationS / 3600 * IF * IF * 100;
    }

    for (const pl of plans) {
      const durationS = Math.round(pl.min * vol * (0.85 + rnd() * 0.3) * 60);
      if (durationS < 15 * 60) continue;
      const a: Activity = { id: `demo-${++n}`, start: `${d}T${pl.sport === "swim" ? "07" : "18"}:${String(Math.floor(rnd() * 59)).padStart(2, "0")}:00Z`, date: d, sport: pl.sport, subSport: pl.sub ?? "road", name: "", durationS, distanceM: 0, elevationM: 0, sessionType: pl.type };
      const noise = 0.97 + rnd() * 0.06;
      if (pl.sport === "run") {
        const f = { long: 1.2, endurance: 1.22, recovery: 1.32, tempo: 1.03, intervals: 1.1, technique: 1.25, race: 1 }[pl.type];
        const pace = thr * f * noise * (pl.sub === "trail" ? 1.15 : 1);
        a.distanceM = Math.round((durationS / pace) * 1000);
        a.elevationM = Math.round(a.distanceM / 1000 * (pl.sub === "trail" ? 35 : 6));
        const IF = thr / pace;
        a.avgHr = Math.round(profile.lthr * (0.78 + IF * 0.18)); a.maxHr = a.avgHr + 12;
        a.zoneSeconds = zones(durationS, zoneMix(pl.type));
        a.gear = pl.type === "tempo" || pl.type === "intervals" ? "Sapatilhas rápidas" : "Sapatilhas treino";
        a.name = { long: "Longo", recovery: "Corrida fácil", tempo: "Tempo run", intervals: "Séries", endurance: "Corrida aeróbia", technique: "Corrida", race: "Prova" }[pl.type] + (pl.sub === "trail" ? " (trail)" : "");
      } else if (pl.sport === "bike") {
        const IF = { long: 0.7, endurance: 0.68, recovery: 0.55, tempo: 0.8, intervals: 0.84, technique: 0.6, race: 0.85 }[pl.type] * noise;
        a.normPower = Math.round(ftp * IF); a.avgPower = Math.round(a.normPower * (pl.sub === "indoor" ? 0.97 : 0.91));
        const kmh = (pl.sub === "indoor" ? 31 : 27) + (IF - 0.68) * 30 + (ftp - 230) / 15;
        a.distanceM = Math.round(kmh * durationS / 3.6);
        a.elevationM = pl.sub === "indoor" ? 0 : Math.round(a.distanceM / 1000 * (8 + rnd() * 6));
        a.avgHr = Math.round(profile.lthr * (0.7 + IF * 0.25)); a.maxHr = a.avgHr + 18;
        a.zoneSeconds = zones(durationS, zoneMix(pl.type));
        a.gear = pl.sub === "indoor" ? "Rolo" : pl.type === "long" && m >= 5 && m <= 9 ? "Bicicleta TT" : "Bicicleta estrada";
        a.name = { long: "Volta longa", endurance: "Rolagem Z2", recovery: "Recuperação", tempo: "Sweet spot", intervals: "Intervalos VO2", technique: "Cadência", race: "Prova" }[pl.type] + (pl.sub === "indoor" ? " (rolo)" : "");
      } else if (pl.sport === "swim") {
        const f = { technique: 1.2, endurance: 1.1, intervals: 1.04, long: 1.12, recovery: 1.25, tempo: 1.03, race: 0.97 }[pl.type];
        const pace = css * f * noise * (pl.sub === "open_water" ? 1.06 : 1);
        a.distanceM = Math.round((durationS / pace) * 100 / 25) * 25;
        a.avgHr = Math.round(profile.lthr * 0.82); a.maxHr = a.avgHr + 15;
        a.zoneSeconds = zones(durationS, zoneMix(pl.type));
        a.gear = pl.sub === "open_water" ? "Fato isotérmico" : null;
        a.name = { technique: "Técnica", endurance: "Natação aeróbia", intervals: "Séries CSS", long: "Natação longa", recovery: "Solto", tempo: "Ritmo", race: "Prova" }[pl.type] + (pl.sub === "open_water" ? " (mar)" : "");
      } else {
        a.subSport = "gym"; a.name = "Força"; a.avgHr = 112; a.zoneSeconds = zones(durationS, [0.7, 0.25, 0.05, 0, 0]);
      }
      a.calories = Math.round(durationS / 3600 * (pl.sport === "swim" ? 600 : pl.sport === "strength" ? 350 : 700));
      a.bests = demoBests(a, ftp, thr, css);
      acts.push(a);
      dayTss += estTss(a, ftp, thr, css, profile.lthr);
    }

    // carga para modelar a recuperação
    const tsb = ctl - atl;
    ctl += (dayTss - ctl) / 42;
    atl += (dayTss - atl) / 7;

    const daysToEnd = diffDays(d, today);
    const weekend = wd >= 5;
    let sleepH = 7.2 + (weekend ? 0.4 : 0) + (rnd() - 0.5) * 1.2 - Math.max(0, -tsb - 20) * 0.01;
    let hrv = 58 + (4 - yearsBack) * 1.2 + tsb * 0.22 + (sleepH - 7.2) * 2 + (rnd() - 0.5) * 9;
    let rhr = 47 - (4 - yearsBack) * 0.4 - tsb * 0.06 + (rnd() - 0.5) * 3;
    let stress = 27 + (weekend ? -5 : 4) + (rnd() - 0.5) * 12 - tsb * 0.1;

    // cenário demo: início de constipação nos últimos dias
    if (daysToEnd <= 4) hrv -= (5 - daysToEnd) * 4.5;
    if (daysToEnd <= 1) rhr += 6.5;
    if (daysToEnd === 0) sleepH = 5.6;
    if (daysToEnd === 2) sleepH = 5.8;
    if (daysToEnd <= 2) stress += 10;

    const sleepS = Math.round(sleepH * 3600);
    const sleepScore = Math.round(Math.max(30, Math.min(97, 45 + (sleepH - 5.5) * 17 + (rnd() - 0.5) * 8)));
    wellness.push({
      date: d, sleepS, sleepScore,
      deepS: Math.round(sleepS * 0.18), remS: Math.round(sleepS * 0.22), lightS: Math.round(sleepS * 0.55), awakeS: Math.round(sleepS * 0.05),
      hrv: Math.round(hrv), rhr: Math.round(rhr), stressAvg: Math.round(Math.max(8, stress)),
      bbMorning: Math.round(Math.max(15, Math.min(100, 50 + (sleepH - 6.5) * 14 + (hrv - 60) * 0.8))),
      steps: Math.round(7000 + rnd() * 6000), hydrationMl: Math.round(2000 + rnd() * 1500),
    });
  }

  const y = year(today);
  const raceThisYear = `${y}-06-22`;
  const nextRace = { date: raceThisYear > today ? raceThisYear : `${y + 1}-06-22`, name: "Meio Ironman", priority: "A" as const };
  return { activities: acts.sort((a, b) => (a.start < b.start ? 1 : -1)), wellness, profile, nextRace };
}

function zoneMix(t: TrainType): number[] {
  switch (t) {
    case "recovery": return [0.75, 0.22, 0.03, 0, 0];
    case "endurance": return [0.25, 0.65, 0.08, 0.02, 0];
    case "long": return [0.2, 0.62, 0.14, 0.04, 0];
    case "technique": return [0.5, 0.4, 0.08, 0.02, 0];
    case "tempo": return [0.15, 0.3, 0.35, 0.2, 0];
    case "intervals": return [0.2, 0.35, 0.12, 0.2, 0.13];
    case "race": return [0.03, 0.15, 0.4, 0.37, 0.05];
  }
}

function zones(dur: number, mix: number[]) { return mix.map((f) => Math.round(dur * f)); }

function estTss(a: Activity, ftp: number, thr: number, css: number, lthr: number) {
  const h = a.durationS / 3600;
  if (a.sport === "bike" && a.normPower) { const IF = a.normPower / ftp; return h * IF * IF * 100; }
  if (a.sport === "run" && a.distanceM) { const IF = thr / (a.durationS / (a.distanceM / 1000)); return h * IF * IF * 100; }
  if (a.sport === "swim" && a.distanceM) { const IF = css / (a.durationS / (a.distanceM / 100)); return h * IF ** 3 * 100; }
  return h * 40;
}

// ───────────── Fase 2: recordes, provas, check-ins e séries temporais simuladas ─────────────

/** Ruído determinístico em [0, 1) a partir de um texto (não consome o gerador principal). */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

const POWER_CURVE: [number, number][] = [[1, 3.2], [2, 3.0], [5, 2.6], [10, 2.2], [20, 1.8], [30, 1.6], [60, 1.35], [120, 1.2], [300, 1.08], [600, 1.0], [1200, 0.96], [1800, 0.93], [3600, 0.88], [7200, 0.8], [18000, 0.7]];

function demoBests(a: Activity, ftp: number, thr: number, css: number): Record<string, number> | null {
  const n = (k: string) => 0.99 + hash01(a.id + k) * 0.02;
  const out: Record<string, number> = {};
  if (a.sport === "run" && a.distanceM > 0) {
    const pace = a.durationS / (a.distanceM / 1000);
    const f: Record<number, number> = a.sessionType === "intervals" ? { 1000: 0.86, 5000: 0.95, 10000: 0.985 } : a.sessionType === "tempo" ? { 1000: 0.94, 5000: 0.975, 10000: 0.99 } : { 1000: 0.96, 5000: 0.985, 10000: 0.995, 21098: 1, 42195: 1 };
    for (const [m, k] of Object.entries(f)) if (a.distanceM >= Number(m)) out[`fastestSplit_${m}`] = +((Number(m) / 1000) * pace * k * n(m)).toFixed(1);
  }
  if (a.sport === "swim" && a.distanceM > 0) {
    const p100 = a.durationS / (a.distanceM / 100);
    const f: Record<number, number> = { 100: a.sessionType === "intervals" ? 0.86 : 0.9, 400: 0.95, 750: 0.975, 1500: 0.99 };
    for (const [m, k] of Object.entries(f)) if (a.distanceM >= Number(m)) out[`fastestSplit_${m}`] = +((Number(m) / 100) * p100 * k * n(m)).toFixed(1);
  }
  if (a.sport === "bike" && a.normPower) {
    const u = ({ intervals: 0.98, tempo: 0.94, long: 0.88, endurance: 0.84, recovery: 0.6, technique: 0.7, race: 0.95 } as Record<string, number>)[a.sessionType ?? "endurance"] ?? 0.85;
    for (const [d, c] of POWER_CURVE) {
      if (d > a.durationS) break;
      let w = ftp * c * u;
      if (d > 600) w = Math.min(w, a.normPower * (d <= 1200 ? 1.12 : d <= 3600 ? 1.05 : 1.0));
      out[`maxAvgPower_${d}`] = Math.round(w * n(String(d)));
    }
    if (a.distanceM >= 40000) out.fastestSplit_40000 = Math.round((40000 / ((a.distanceM / a.durationS) * 1.04)) * n("40k"));
  }
  return Object.keys(out).length ? out : null;
}

const RACE_META: Record<string, { name: string; sport: "triathlon"; distance: Race["distance"]; priority: Race["priority"] }> = {
  "5-12": { name: "Triatlo Olímpico", sport: "triathlon", distance: "olympic", priority: "B" },
  "6-22": { name: "Meio Ironman", sport: "triathlon", distance: "half", priority: "A" },
  "9-14": { name: "Triatlo Sprint", sport: "triathlon", distance: "sprint", priority: "C" },
};

/** Provas passadas (com resultado, a partir das atividades) e as da próxima época. */
export function demoRaces(acts: Activity[], today = todayISO()): Race[] {
  const out: Race[] = [];
  for (const a of acts) {
    if (a.sessionType !== "race" || a.sport !== "brick") continue;
    const meta = RACE_META[`${month(a.date)}-${Number(a.date.slice(8))}`];
    if (meta) out.push({ id: `race-${a.date}`, date: a.date, ...meta, resultTimeS: a.durationS, goalTimeS: Math.round(a.durationS * (hash01(a.date) < 0.5 ? 1.015 : 0.985)), location: "Portugal" });
  }
  const y = year(today);
  for (const [md, meta] of Object.entries(RACE_META)) {
    const [m, d] = md.split("-").map(Number);
    let date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (date <= today) date = `${y + 1}${date.slice(4)}`;
    if (!out.some((r) => r.date === date)) out.push({ id: `race-${date}`, date, ...meta, goalTimeS: meta.distance === "half" ? 4 * 3600 + 55 * 60 : meta.distance === "olympic" ? 2 * 3600 + 10 * 60 : 65 * 60, location: "Portugal" });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function demoCheckins(today = todayISO()): CheckIn[] {
  return Array.from({ length: 21 }, (_, i) => addDays(today, -21 + i)).map((d, i) => ({
    date: d,
    energy: Math.max(1, Math.min(5, Math.round(3.6 + (hash01(d + "e") - 0.5) * 2 - (i > 17 ? 1.2 : 0)))),
    soreness: Math.max(1, Math.min(5, Math.round(2.2 + (hash01(d + "s") - 0.5) * 2))),
    mood: Math.max(1, Math.min(5, Math.round(3.8 + (hash01(d + "m") - 0.5) * 2))),
    motivation: Math.max(1, Math.min(5, Math.round(4 + (hash01(d + "v") - 0.5) * 2))),
    notes: null,
  }));
}

/** Séries temporais plausíveis para uma atividade demo (5 s por amostra). */
export function demoStreams(a: Activity, p: AthleteProfile): ActivityStreams {
  const dt = 5;
  const n = Math.max(12, Math.floor(a.durationS / dt));
  const t: number[] = [], hr: number[] = [], power: (number | null)[] = [], speed: number[] = [], cadence: number[] = [], alt: number[] = [], dist: number[] = [];
  const avgSpeed = a.durationS > 0 ? a.distanceM / a.durationS : 0;
  const hrBase = a.avgHr ?? Math.round(p.lthr * 0.82);
  const intervals = a.sessionType === "intervals" || a.sessionType === "tempo";
  const [on, off] = a.sessionType === "intervals" ? (a.sport === "run" ? [240, 120] : [300, 180]) : [720, 300];
  const wu = Math.min(900, a.durationS * 0.15), cd = Math.min(600, a.durationS * 0.1);
  let d = 0, hrNow = hrBase - 25;
  for (let i = 0; i < n; i++) {
    const ts = i * dt;
    const r = hash01(a.id + i);
    let k = 1; // intensidade relativa
    if (ts < wu) k = 0.85 + (0.15 * ts) / wu;
    else if (ts > a.durationS - cd) k = 0.85;
    else if (intervals) k = (ts - wu) % (on + off) < on ? 1.18 : 0.8;
    const drift = (ts / a.durationS) * (a.sessionType === "long" ? 0.06 : 0.03); // deriva cardíaca
    const target = hrBase * (0.75 + 0.25 * k) * (1 + drift);
    hrNow += (target - hrNow) * 0.12 + (r - 0.5) * 1.5;
    const v = avgSpeed * k * (0.97 + r * 0.06);
    d += v * dt;
    t.push(ts); hr.push(Math.round(hrNow)); speed.push(+v.toFixed(2)); dist.push(Math.round(d));
    power.push(a.sport === "bike" && a.avgPower ? Math.round(a.avgPower * k * (0.94 + r * 0.12)) : null);
    cadence.push(a.sport === "bike" ? Math.round(85 + (r - 0.5) * 8) : a.sport === "run" ? Math.round(172 + (r - 0.5) * 6) : 30);
    alt.push(Math.round(60 + (a.elevationM / 4) * Math.sin(i / (n / 6)) + (a.elevationM / 6) * Math.sin(i / (n / 17))));
  }
  // voltas: por séries, ou a cada 5 km (bici) / 1 km (corrida) / 400 m (natação)
  const lapLen = a.sport === "bike" ? 5000 : a.sport === "swim" ? 400 : 1000;
  const laps: ActivityStreams["laps"] = [];
  let start = 0;
  const pushLap = (end: number) => {
    const idx = t.map((_, i) => i).filter((i) => t[i] >= t[start] && t[i] < t[end]);
    if (!idx.length) return;
    const m = (arr: (number | null)[]) => { const v = idx.map((i) => arr[i]).filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    laps.push({ index: laps.length + 1, startS: t[start], durationS: t[end] - t[start], distanceM: Math.round(dist[end] - (start ? dist[start] : 0)), avgHr: Math.round(m(hr)!), avgPower: m(power) == null ? null : Math.round(m(power)!), avgSpeed: +(m(speed)!).toFixed(2) });
    start = end;
  };
  if (intervals && a.sport !== "swim") {
    const marks = [wu];
    for (let x = wu + on; x < a.durationS - cd; x += on + off) marks.push(x, x + off);
    marks.push(a.durationS - cd);
    for (const mk of marks) { const end = Math.min(n - 1, Math.round(mk / dt)); if (end > start) pushLap(end); }
    pushLap(n - 1);
  } else {
    for (let i = 1; i < n; i++) if (Math.floor(dist[i] / lapLen) > Math.floor(dist[start] / lapLen) && dist[i] - (start ? dist[start] : 0) >= lapLen * 0.98) pushLap(i);
    if (start < n - 1) pushLap(n - 1);
  }
  return { activityId: a.id, sampleS: dt, t, hr, power: a.sport === "bike" && a.avgPower ? power : undefined, speed, cadence, alt, dist, laps };
}
