// Datas como "YYYY-MM-DD", aritmética em UTC para evitar erros de fuso horário.

export const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function toDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const n = new Date();
  return fmt(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

export function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

/** Desloca anos mantendo mês/dia; 29 Fev → 28 Fev. */
export function addYears(d: string, n: number): string {
  const y = Number(d.slice(0, 4)) + n;
  const m = Number(d.slice(5, 7));
  let day = Number(d.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (day > last) day = last;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5);
}

export function year(d: string) { return Number(d.slice(0, 4)); }
export function month(d: string) { return Number(d.slice(5, 7)); }

/** 0 = segunda … 6 = domingo */
export function weekday(d: string): number {
  return (toDate(d).getUTCDay() + 6) % 7;
}

export function isoWeek(d: string): number {
  const x = toDate(d);
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const fd = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3);
  return 1 + Math.round((x.getTime() - firstThursday.getTime()) / (7 * 864e5));
}

export function startOfWeek(d: string): string {
  return addDays(d, -weekday(d));
}

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDatePt(d: string): string {
  return `${Number(d.slice(8, 10))} ${MONTHS_PT[month(d) - 1]} ${year(d)}`;
}

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function fmtPace(sPerKm: number): string {
  if (!isFinite(sPerKm) || sPerKm <= 0) return "–";
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
