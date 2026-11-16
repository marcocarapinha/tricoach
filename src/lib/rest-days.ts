import type { AthleteProfile, WeekSetting } from "./types";

/** Dias de descanso de uma semana: os escolhidos para essa semana ou, senão, os habituais do perfil. */
export function restDaysFor(ws: string, profile: AthleteProfile, weeks: WeekSetting[]): { days: number[]; custom: boolean } {
  const w = weeks.find((x) => x.weekStart === ws);
  return w ? { days: [...w.restDays].sort(), custom: true } : { days: [...(profile.restDays ?? [])].sort(), custom: false };
}
