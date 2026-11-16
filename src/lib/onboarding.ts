// Estimativas usadas pelo assistente inicial quando o atleta não conhece um valor.
// São pontos de partida: a app recomenda substituí-los por testes ou pelos valores do Garmin.
import type { AthleteProfile } from "./types";

/** "4:15" → 255 s; "255" → 255; vazio/inválido → null */
export function parseMmSs(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  if (m[2] == null) return Number(m[1]);
  const s = Number(m[2]);
  return s < 60 ? Number(m[1]) * 60 + s : null;
}
export const fmtMmSs = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** FC máxima pela idade (Tanaka et al., 2001): 208 − 0,7 × idade */
export const hrMaxFromAge = (age: number) => Math.round(208 - 0.7 * age);
/** FC de limiar ≈ 89 % da FC máxima (intervalo típico 85–92 %) */
export const lthrFromHrMax = (hrMax: number) => Math.round(hrMax * 0.89);

const WKG: Record<AthleteProfile["functionalLevel"], number> = { beginner: 2.2, intermediate: 3.0, advanced: 3.8 };
/** FTP aproximado pelo nível e peso (W/kg típicos de triatletas amadores), arredondado a 5 W */
export const ftpFromLevel = (weightKg: number, level: AthleteProfile["functionalLevel"]) => Math.round((weightKg * WKG[level]) / 5) * 5;
/** FTP a partir do teste de 20 min: 95 % da potência média */
export const ftpFrom20min = (avgW: number) => Math.round(avgW * 0.95);

/** Ritmo de limiar a partir do tempo de 10 km: ritmo de 10 km + 4 % (s/km) */
export const thresholdPaceFrom10k = (total10kS: number) => Math.round((total10kS / 10) * 1.04);

/** CSS (s/100 m) a partir dos testes de 400 m e 200 m: (T400 − T200) / 2 */
export const cssFromTests = (t400: number, t200: number) => Math.round((t400 - t200) / 2);
