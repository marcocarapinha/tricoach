// Importação dos treinos do treinador a partir de uma folha de cálculo "não formatada".
// Reconhece três arrumações comuns e, em último caso, lê célula a célula:
//   1. Lista:    uma coluna com datas e o treino nas outras colunas da mesma linha
//   2. Grelha:   uma linha com os dias da semana (Seg…Dom) e uma semana por linha
//   3. Grelha transposta: os dias da semana numa coluna e uma semana por coluna
import { addDays, startOfWeek, todayISO } from "./dates";
import { parseWorkoutText, type Paces, type ParsedSession } from "../../supabase/functions/_shared/workout-text.ts";

export type Cell = string | number | Date | null | undefined;
export interface Sheet { name: string; rows: Cell[][] }

export interface DraftSession extends ParsedSession {
  key: string;
  date: string;
  include: boolean;
  /** de onde veio, ex.: "Plano!C5" */
  origin: string;
}

export type Layout = "list" | "grid" | "grid-transposed" | "cells";
export interface ImportResult {
  layout: Layout;
  sessions: DraftSession[];
  warnings: string[];
  /** a folha não tem datas: as semanas contam a partir de `startDate` */
  usesStartDate: boolean;
}

const WEEKDAY_RE: RegExp[] = [
  /^(seg|segunda|2a|2ª|mon|monday)/, /^(ter|terca|3a|3ª|tue|tuesday)/, /^(qua|quarta|4a|4ª|wed|wednesday)/,
  /^(qui|quinta|5a|5ª|thu|thursday)/, /^(sex|sexta|6a|6ª|fri|friday)/, /^(sab|sabado|sat|saturday)/, /^(dom|domingo|sun|sunday)/,
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const colName = (c: number) => { let s = ""; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function weekdayOf(cell: Cell): number | null {
  if (typeof cell !== "string") return null;
  const t = norm(cell).replace(/[-.\s]feira/, "");
  if (t.length > 25) return null;
  const i = WEEKDAY_RE.findIndex((re) => re.test(t));
  return i >= 0 ? i : null;
}

/** Data de uma célula: Date do Excel, "17/11", "17-11-2026", "2026-11-17". O ano em falta é o mais próximo de hoje. */
export function dateOf(cell: Cell, today = todayISO()): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return iso(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  if (typeof cell !== "string") return null;
  const t = cell.trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/(?:^|\D)(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (m[3]) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d);
  const y0 = +today.slice(0, 4);
  const opts = [y0 - 1, y0, y0 + 1].map((y) => valid(y, mo, d)).filter((x): x is string => !!x);
  // ano que deixa a data mais perto de hoje (planos costumam ser futuros: dá preferência a -60 … +300 dias)
  return opts.sort((a, b) => score(a, today) - score(b, today))[0] ?? null;
}
function valid(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = iso(y, m, d);
  return new Date(s + "T00:00:00Z").getUTCDate() === d ? s : null;
}
function score(d: string, today: string) {
  const diff = (Date.parse(d) - Date.parse(today)) / 864e5;
  return diff < -60 ? Math.abs(diff) * 3 : diff > 300 ? diff * 2 : Math.abs(diff);
}

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? "" : String(c)).trim();
const hasText = (c: Cell) => text(c).length > 0 && !/^\d+([.,]\d+)?$/.test(text(c));

let seq = 0;
function drafts(raw: string, date: string, origin: string, paces: Paces): DraftSession[] {
  return parseWorkoutText(raw, paces).map((p) => ({ ...p, key: `${origin}-${seq++}`, date, include: true, origin }));
}

/** Lê todas as folhas e devolve as sessões encontradas para revisão. */
export function importSheets(sheets: Sheet[], paces: Paces, startDate = startOfWeek(addDays(todayISO(), 7)), today = todayISO()): ImportResult {
  const all: ImportResult = { layout: "cells", sessions: [], warnings: [], usesStartDate: false };
  const layouts = new Set<Layout>();
  let weekOffset = 0;
  for (const sh of sheets) {
    const r = importSheet(sh, paces, addDays(startOfWeek(startDate), weekOffset * 7), today);
    if (!r.sessions.length) continue;
    layouts.add(r.layout);
    all.sessions.push(...r.sessions);
    all.warnings.push(...r.warnings);
    if (r.usesStartDate) { all.usesStartDate = true; weekOffset += r.weeks; }
  }
  all.layout = layouts.size === 1 ? [...layouts][0] : layouts.has("grid") ? "grid" : layouts.has("list") ? "list" : "cells";
  all.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!all.sessions.length) all.warnings.push("Não foram encontrados treinos. Confirme que o ficheiro tem as modalidades escritas (ex.: «Bike 1h30 Z2», «Natação 2000m»).");
  return all;
}

function importSheet(sh: Sheet, paces: Paces, start: string, today: string): { layout: Layout; sessions: DraftSession[]; warnings: string[]; usesStartDate: boolean; weeks: number } {
  const rows = sh.rows.map((r) => r ?? []);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const at = (r: number, c: number) => rows[r]?.[c];
  const ref = (r: number, c: number) => `${sh.name}!${colName(c)}${r + 1}`;
  const warnings: string[] = [];

  // ── 2. Grelha: linha de cabeçalho com ≥ 4 dias da semana ──
  const headerRows = rows.map((r, i) => ({ i, cols: r.map((c, j) => [j, weekdayOf(c)] as const).filter(([, w]) => w != null) as [number, number][] })).filter((h) => h.cols.length >= 4);
  if (headerRows.length) {
    const out: DraftSession[] = [];
    let weeks = 0, usesStart = false;
    headerRows.forEach((h, hi) => {
      const end = headerRows[hi + 1]?.i ?? rows.length;
      const dayCols = new Map(h.cols);
      // datas no próprio cabeçalho ("Seg 17/11") → uma semana com várias linhas por dia
      const headerDates = h.cols.map(([c]) => dateOf(at(h.i, c), today));
      if (headerDates.filter(Boolean).length >= 3) {
        for (let r = h.i + 1; r < end; r++) for (const [c, wd] of h.cols) {
          const d = dateOf(at(h.i, c), today) ?? addDays(startOfWeek(headerDates.find(Boolean)!), wd);
          if (hasText(at(r, c))) out.push(...drafts(text(at(r, c)), d, ref(r, c), paces));
        }
        return;
      }
      for (let r = h.i + 1; r < end; r++) {
        const cells = h.cols.filter(([c]) => hasText(at(r, c)));
        if (!cells.length) continue;
        // data da semana numa coluna que não é de dia (ex.: coluna A com "17/11" ou a data de segunda)
        let ws: string | null = null;
        for (let c = 0; c < width && !ws; c++) if (!dayCols.has(c)) { const d = dateOf(at(r, c), today); if (d) ws = startOfWeek(d); }
        if (!ws) {
          const label = Array.from({ length: width }, (_, c) => (dayCols.has(c) ? "" : text(at(r, c)))).join(" ");
          const n = norm(label).match(/(?:semana|sem|week|wk|s)\s*(\d{1,2})/);
          ws = addDays(start, ((n ? +n[1] - 1 : weeks)) * 7);
          usesStart = true;
        }
        weeks++;
        for (const [c, wd] of cells) out.push(...drafts(text(at(r, c)), addDays(ws, wd), ref(r, c), paces));
      }
    });
    return { layout: "grid", sessions: out, warnings, usesStartDate: usesStart, weeks: Math.max(1, weeks) };
  }

  // ── 3. Grelha transposta: coluna com ≥ 4 dias da semana ──
  for (let c = 0; c < width; c++) {
    const dayRows = rows.map((r, i) => [i, weekdayOf(r[c])] as const).filter(([, w]) => w != null) as [number, number][];
    if (dayRows.length < 4) continue;
    const out: DraftSession[] = [];
    let weeks = 0, usesStart = false;
    const headerRow = Math.max(0, dayRows[0][0] - 1);
    for (let k = 0; k < width; k++) {
      if (k === c) continue;
      const cells = dayRows.filter(([r]) => hasText(at(r, k)));
      if (!cells.length) continue;
      const hd = dateOf(at(headerRow, k), today);
      let ws: string;
      if (hd) ws = startOfWeek(hd);
      else {
        const n = norm(text(at(headerRow, k))).match(/(?:semana|sem|week|wk|s)\s*(\d{1,2})/);
        ws = addDays(start, (n ? +n[1] - 1 : weeks) * 7);
        usesStart = true;
      }
      weeks++;
      for (const [r, wd] of cells) out.push(...drafts(text(at(r, k)), addDays(ws, wd), ref(r, k), paces));
    }
    return { layout: "grid-transposed", sessions: out, warnings, usesStartDate: usesStart, weeks: Math.max(1, weeks) };
  }

  // ── 1. Lista: coluna com ≥ 3 datas ──
  let dateCol = -1, best = 0;
  for (let c = 0; c < width; c++) {
    const n = rows.filter((r) => dateOf(r[c], today)).length;
    if (n > best) { best = n; dateCol = c; }
  }
  if (best >= 3) {
    const out: DraftSession[] = [];
    let lastDate: string | null = null;
    rows.forEach((r, i) => {
      const d = dateOf(r[dateCol], today) ?? (r[dateCol] == null || text(r[dateCol]) === "" ? lastDate : null);
      if (!d) return;
      lastDate = d;
      const parts = r.map((c, j) => (j === dateCol || weekdayOf(c) != null ? "" : text(c))).filter(Boolean);
      if (!parts.length) return;
      out.push(...drafts(parts.join(" | "), d, ref(i, dateCol), paces));
    });
    return { layout: "list", sessions: out, warnings, usesStartDate: false, weeks: 0 };
  }

  // ── 4. Sem estrutura: cada célula com uma modalidade é uma sessão, em dias seguidos ──
  const out: DraftSession[] = [];
  let k = 0;
  rows.forEach((r, i) => r.forEach((c, j) => {
    if (!hasText(c)) return;
    const ds = drafts(text(c), addDays(start, k), ref(i, j), paces).filter((s) => s.sport !== "other");
    if (ds.length) { out.push(...ds); k++; }
  }));
  if (out.length) warnings.push(`A folha «${sh.name}» não tem datas nem dias da semana: os treinos foram postos em dias seguidos a partir de ${start}. Acerte as datas antes de importar.`);
  return { layout: "cells", sessions: out, warnings, usesStartDate: true, weeks: Math.ceil(k / 7) };
}

/** CSV simples (vírgula ou ponto e vírgula, aspas). */
export function parseCsv(textIn: string): Cell[][] {
  const first = textIn.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : (first.includes("\t") ? "\t" : ",");
  const rows: Cell[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (q) {
      if (ch === '"' && textIn[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && textIn[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Lê um ficheiro .xlsx / .csv no browser (o ExcelJS só é descarregado quando é preciso). */
export async function readSpreadsheet(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) return [{ name: file.name, rows: parseCsv(await file.text()) }];
  if (name.endsWith(".xls")) throw new Error("Ficheiros .xls antigos não são suportados. Abra-o no Excel e guarde como .xlsx (ou .csv).");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const out: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) { out[cn - 1] = null; return; }
        const v: any = cell.value;
        out[cn - 1] = v == null ? null
          : v instanceof Date ? v
          : typeof v === "object" ? (v.richText ? v.richText.map((t: any) => t.text).join("") : v.result instanceof Date ? v.result : v.result ?? v.text ?? v.hyperlink ?? null)
          : v;
      });
      rows[rn - 1] = out;
    });
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}
