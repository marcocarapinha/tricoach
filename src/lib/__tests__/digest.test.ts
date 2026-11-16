import { describe, it, expect } from "vitest";
import { dailyDigest, localDate, localHour } from "../../../supabase/functions/_shared/daily-digest.ts";

const days = (n: number, end: string) => Array.from({ length: n }, (_, i) => { const d = new Date(end + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - (n - 1 - i)); return d.toISOString().slice(0, 10); });

describe("resumo diário (push)", () => {
  const today = "2026-11-14";
  const base = days(70, today).map((day, i) => ({ day, hrv: 62 + ((i * 7) % 5) - 2, rhr: 46 + (i % 3) - 1, sleep_s: 7.4 * 3600 }));
  it("dia normal: só o plano", () => {
    const d = dailyDigest(base, [{ sport: "run", session_type: "endurance", duration_min: 60, title: "x" }], today);
    expect(d.severity).toBe("info");
    expect(d.body).toBe("Hoje: Corrida 60 min.");
  });
  it("HRV baixa + FC alta 2 dias + sono curto → alerta", () => {
    const sick = base.map((w, i) => (i >= 64 ? { ...w, hrv: 44, rhr: i >= 68 ? 54 : w.rhr, sleep_s: i >= 67 ? 5.5 * 3600 : w.sleep_s } : w));
    const d = dailyDigest(sick, [], today);
    expect(d.severity).toBe("alert");
    expect(d.rules).toEqual(["hrv_rhr_alert", "sleep_short"]);
    expect(d.body).toContain("Hoje: sem treino planeado.");
  });
  it("hora e data locais por fuso", () => {
    const now = new Date("2026-07-01T06:30:00Z");
    expect(localHour(now, "Europe/Lisbon")).toBe(7); // verão: UTC+1
    expect(localDate(new Date("2026-11-14T23:30:00Z"), "Asia/Tokyo")).toBe("2026-11-15");
  });
});
