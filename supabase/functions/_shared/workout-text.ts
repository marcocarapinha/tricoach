// Leitura de treinos escritos à mão (Excel do treinador, calendário .ics do TrainingPeaks…).
// Módulo puro, partilhado pela app (importação de Excel) e pela Edge Function calendar-sync.
// Entende português e inglês: "Bike 1h30 Z2", "Natação 2000m: 4x200 limiar", "Corrida 45' solto", "Descanso".

export type WSport = "swim" | "bike" | "run" | "brick" | "strength" | "other";
export type WType = "long" | "intervals" | "tempo" | "endurance" | "recovery" | "race" | "technique" | "functional";

export interface ParsedSession {
  sport: WSport;
  type: WType;
  durationMin: number;
  distanceM: number | null;
  /** a duração foi estimada a partir da distância (ou por omissão) */
  estimated: boolean;
  title: string;
  description: string;
}

export interface Paces {
  /** s/km */
  runThresholdPace: number;
  /** s/100 m */
  css: number;
}

const SPORT_PT: Record<WSport, string> = { swim: "Natação", bike: "Ciclismo", run: "Corrida", brick: "Brick", strength: "Força", other: "Treino" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const SPORT_RE: [WSport, RegExp][] = [
  ["brick", /\b(brick|combinado|transicao|transicoes|bike\s*\+\s*run|bici\s*\+\s*corr)/],
  ["swim", /\b(natacao|nadar|swim\w*|piscina|nat\b|aguas abertas|open water|mar\b)/],
  ["bike", /\b(bike|bicicleta|bici\b|ciclismo|cycl\w*|rolo|btt|mtb|ride|spinning|zwift|estrada|cicl\b)/],
  ["run", /\b(corrida|correr|corr\b|run\b|runs\b|running|trote|jog\w*|passadeira|trail|pista|cc\b)/],
  ["strength", /\b(forca|ginasio|gym|musculacao|core|funcional|mobilidade|strength|pilates|alongamentos|prevencao)/],
];
const REST_RE = /^\s*(descanso|folga|rest|off|livre|day off|repouso|recuperacao total|-)\s*\.?\s*$/;

export function detectSport(text: string): WSport | null {
  const t = norm(text);
  for (const [s, re] of SPORT_RE) if (re.test(t)) return s;
  return null;
}

export const isRestText = (text: string) => REST_RE.test(norm(text));

export function detectType(text: string, sport: WSport, durationMin: number | null): WType {
  const t = norm(text);
  if (sport === "strength") return "functional";
  if (/\b(prova|competicao|race|corrida oficial|triatlo|duatlo)\b/.test(t) && !/ritmo de prova|race pace/.test(t)) return "race";
  if (/\b(recupera\w*|regenera\w*|solto|soltar|easy|recovery|z1)\b/.test(t)) return "recovery";
  if (/\b(tecnica|drills?|educativos|tecnicos)\b/.test(t)) return "technique";
  if (/\d+\s*x\s*\d|\b(intervalos?|series|repeticoes|vo2|z5|fartlek|tiros|rampas)\b/.test(t)) return "intervals";
  if (/\b(limiar|tempo|threshold|sweet ?spot|sst|z4|z3|ritmo de prova|race pace|ritmo)\b/.test(t)) return "tempo";
  if (/\b(longo|longa|long|tirada|fundo)\b/.test(t)) return "long";
  if (durationMin != null && ((sport === "bike" && durationMin >= 150) || (sport === "run" && durationMin >= 90))) return "long";
  return "endurance";
}

/** Duração total em minutos a partir do texto ("1h30", "1:30h", "90'", "45 min", "1:30:00"). */
export function parseDuration(text: string): number | null {
  const t = norm(text).replace(/,/g, ".");
  const c: number[] = [];
  // h:mm:ss
  for (const m of t.matchAll(/\b(\d{1,2}):(\d{2}):(\d{2})\b/g)) c.push(+m[1] * 60 + +m[2] + +m[3] / 60);
  const t2 = t.replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, " ");
  // 1h30, 1h 30min, 2h, 1.5h, 1:30h
  for (const m of t2.matchAll(/(?<![x\d])(\d{1,2}(?:\.\d+)?)\s*(?:h|hr|hrs|hora|horas)(?![a-z])\s*(?:(\d{1,2})\s*(?:m|min|mins|minutos|')?)?/g)) c.push(+m[1] * 60 + (m[2] ? +m[2] : 0));
  for (const m of t2.matchAll(/(?<![x\d])(\d{1,2}):(\d{2})\s*h\b/g)) c.push(+m[1] * 60 + +m[2]);
  // minutos (ignora séries "4x10min" e "10' rec")
  for (const m of t2.matchAll(/(?<![x\d.])(\d{1,3})\s*(?:min|mins|minutos|minuto|')(?![a-z])/g)) {
    const before = t2.slice(Math.max(0, (m.index ?? 0) - 3), m.index);
    if (/x\s*$/.test(before)) continue;
    c.push(+m[1]);
  }
  // h:mm isolado (1:30 → 90 min; 45:00 → 45 min)
  if (!c.length) for (const m of t2.matchAll(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g)) c.push(+m[1] <= 5 ? +m[1] * 60 + +m[2] : +m[1]);
  const v = c.filter((x) => x >= 5 && x <= 720);
  return v.length ? Math.round(Math.max(...v)) : null;
}

/** Distância em metros. Natação: soma das partes (com séries "8x100"); outras: maior valor em km. */
export function parseDistance(text: string, sport: WSport): number | null {
  const t = norm(text).replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2").replace(/,/g, ".");
  const km = [...t.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:km|kms|k)\b/g)].map((m) => +m[1] * 1000);
  if (sport !== "swim") {
    if (km.length) return Math.round(Math.max(...km));
    return null;
  }
  let total = 0, maxSingle = 0;
  for (const m of t.matchAll(/(?:(\d{1,2})\s*x\s*)?(\d{2,4})\s*(?:m|mts|metros)?\b(?!\s*(?:in|min))/g)) {
    const reps = m[1] ? +m[1] : 1;
    const d = +m[2];
    if (d < 25 || d > 5000 || d % 25 !== 0) continue;
    total += reps * d;
    if (!m[1]) maxSingle = Math.max(maxSingle, d);
  }
  // "3000m com 10x100": a distância isolada maior já é o total da sessão
  if (maxSingle && maxSingle >= total - maxSingle) total = maxSingle;
  if (!total && km.length) total = Math.max(...km);
  return total >= 100 ? total : null;
}

function estimateMinutes(sport: WSport, distM: number | null, p: Paces): number | null {
  if (!distM) return null;
  if (sport === "swim") return (distM / 100) * p.css * 1.12 / 60;
  if (sport === "run") return (distM / 1000) * p.runThresholdPace * 1.15 / 60;
  if (sport === "bike") return (distM / 1000) / 28 * 60;
  return null;
}

const round5 = (x: number) => Math.max(10, Math.round(x / 5) * 5);
const DEFAULT_MIN: Record<WSport, number> = { swim: 45, bike: 75, run: 45, brick: 90, strength: 45, other: 45 };

function clean(s: string) {
  return s.replace(/\s+/g, " ").replace(/^[\s\-–•·:|]+|[\s\-–•·:|]+$/g, "").trim();
}

/**
 * Lê uma célula/descrição e devolve 0, 1 ou mais sessões.
 * Uma nova sessão começa quando aparece outra modalidade ("Natação 2000m + Corrida 30'").
 */
export function parseWorkoutText(raw: string, paces: Paces): ParsedSession[] {
  const text = (raw ?? "").toString().trim();
  if (!text || isRestText(text)) return [];
  const parts = text.split(/\r?\n|;|\s\+\s|\s\/\s|\s\|\s/).map(clean).filter(Boolean);
  const groups: { sport: WSport | null; lines: string[] }[] = [];
  for (const line of parts) {
    if (isRestText(line)) continue;
    const s = detectSport(line);
    const cur = groups.at(-1);
    if (s && (!cur || (cur.sport && cur.sport !== s))) groups.push({ sport: s, lines: [line] });
    else if (cur) { cur.lines.push(line); if (!cur.sport && s) cur.sport = s; }
    else groups.push({ sport: s, lines: [line] });
  }
  // "Bike 2h + corrida 20'" escrito como brick: mantém as duas sessões; "brick" explícito fica numa só
  return groups.map((g) => {
    const body = g.lines.join(" · ");
    const sport: WSport = g.sport ?? "other";
    const distanceM = parseDistance(body, sport);
    let dur = parseDuration(body);
    let estimated = false;
    if (dur == null) {
      const e = estimateMinutes(sport, distanceM, paces);
      dur = round5(e ?? DEFAULT_MIN[sport]);
      estimated = true;
    }
    const type = detectType(body, sport, dur);
    const first = clean(g.lines[0]).slice(0, 70);
    return {
      sport, type, durationMin: Math.min(720, Math.max(5, Math.round(dur))), distanceM, estimated,
      title: first ? `${SPORT_PT[sport]} · ${first.replace(new RegExp(`^${SPORT_PT[sport]}\\s*[:\\-·]?\\s*`, "i"), "") || SPORT_PT[sport]}`.slice(0, 80) : SPORT_PT[sport],
      description: body,
    };
  });
}

// ───────────── Calendário .ics (TrainingPeaks, Google Calendar…) ─────────────

export interface IcsEvent { uid: string; date: string; summary: string; description: string }

function unescapeIcs(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** Data local (AAAA-MM-DD) de um DTSTART, no fuso indicado. */
function icsDate(prop: string, value: string, tz: string): string | null {
  const v = value.trim();
  const d = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!d) return null;
  if (!d[4] || !d[7]) return `${d[1]}-${d[2]}-${d[3]}`; // data simples ou hora local
  const utc = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4], +d[5], +d[6]));
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(utc);
}

export function parseIcs(ics: string, tz = "Europe/Lisbon"): IcsEvent[] {
  const lines = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur?.DTSTART) {
        const date = icsDate(cur.DTSTART_PARAMS ?? "", cur.DTSTART, tz);
        if (date) out.push({ uid: cur.UID ?? `${date}-${cur.SUMMARY ?? ""}`, date, summary: unescapeIcs(cur.SUMMARY ?? ""), description: unescapeIcs(cur.DESCRIPTION ?? "") });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    const key = name.toUpperCase();
    if (["UID", "SUMMARY", "DESCRIPTION", "DTSTART"].includes(key)) {
      cur[key] = line.slice(i + 1);
      if (key === "DTSTART") cur.DTSTART_PARAMS = params.join(";");
    }
  }
  return out;
}

/** Converte um evento do calendário em sessões (o resumo indica a modalidade; a descrição dá duração e detalhe). */
export function icsEventToSessions(e: IcsEvent, paces: Paces): ParsedSession[] {
  const summarySport = detectSport(e.summary);
  const text = [e.summary, e.description].filter(Boolean).join("\n");
  if (isRestText(e.summary) || /\b(day off|rest day|descanso)\b/i.test(e.summary)) return [];
  if (summarySport) {
    // um evento = uma sessão: a descrição só acrescenta duração e detalhe
    const body = text.replace(/\n+/g, " · ");
    const one = parseWorkoutText(e.summary, paces)[0];
    const dur = parseDuration(body);
    const dist = parseDistance(body, summarySport);
    let durationMin = dur ?? one?.durationMin ?? DEFAULT_MIN[summarySport];
    let estimated = dur == null;
    if (dur == null && dist) { durationMin = round5(estimateMinutes(summarySport, dist, paces) ?? durationMin); estimated = true; }
    return [{
      sport: summarySport, type: detectType(body, summarySport, durationMin), durationMin, distanceM: dist, estimated,
      title: clean(e.summary).slice(0, 80) || SPORT_PT[summarySport], description: clean(e.description).slice(0, 2000),
    }];
  }
  return parseWorkoutText(text, paces);
}
