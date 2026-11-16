export type Sport = "swim" | "bike" | "run" | "brick" | "strength" | "other";

export const SPORTS: Sport[] = ["swim", "bike", "run", "brick", "strength", "other"];

export const SPORT_LABEL: Record<Sport, string> = {
  swim: "Natação",
  bike: "Ciclismo",
  run: "Corrida",
  brick: "Brick / Prova",
  strength: "Força",
  other: "Outros",
};

export const SPORT_COLOR: Record<Sport, string> = {
  swim: "hsl(var(--swim))",
  bike: "hsl(var(--bike))",
  run: "hsl(var(--run))",
  brick: "hsl(var(--brick))",
  strength: "hsl(var(--strength))",
  other: "hsl(var(--other))",
};

export type SessionType = "long" | "intervals" | "tempo" | "endurance" | "recovery" | "race" | "technique" | "functional";

export const SESSION_LABEL: Record<SessionType, string> = {
  long: "Longo",
  intervals: "Intervalos",
  tempo: "Tempo / Limiar",
  endurance: "Aeróbio",
  recovery: "Recuperação",
  race: "Prova",
  technique: "Técnica",
  functional: "Funcional",
};

export interface Activity {
  id: string;
  garminId?: string | null;
  start: string; // ISO datetime
  date: string; // YYYY-MM-DD (local)
  sport: Sport;
  subSport: string; // ex.: "pool", "open_water", "road", "indoor", "trail", "treadmill"
  name: string;
  durationS: number;
  distanceM: number;
  elevationM: number;
  avgHr?: number | null;
  maxHr?: number | null;
  avgPower?: number | null;
  normPower?: number | null;
  calories?: number | null;
  tss?: number | null;
  /** segundos em Z1..Z5 */
  zoneSeconds?: number[] | null;
  gear?: string | null;
  sessionType?: SessionType | null;
  /** melhores marcas desta atividade (s para tempos, W para potência), da Garmin: fastestSplit_* e maxAvgPower_* */
  bests?: Record<string, number> | null;
}

export interface Wellness {
  date: string;
  sleepS?: number | null;
  sleepScore?: number | null;
  deepS?: number | null;
  remS?: number | null;
  lightS?: number | null;
  awakeS?: number | null;
  hrv?: number | null; // média noturna, ms
  rhr?: number | null;
  stressAvg?: number | null;
  bbMorning?: number | null;
  steps?: number | null;
  hydrationMl?: number | null;
}

export interface ReadinessWeights {
  hrv: number;
  sleep: number;
  tsb: number;
  rhr: number;
  energy: number;
  /** check-in subjetivo (sensações) */
  feel: number;
}

export interface AthleteProfile {
  name: string;
  ftp: number; // W
  runThresholdPace: number; // s/km
  css: number; // s/100m
  hrMax: number;
  lthr: number;
  weight: number;
  sleepTargetH: number;
  seasonStartMonth: number; // 1..12 (início da época)
  weights: ReadinessWeights;
  notifyEnabled: boolean;
  notifyHour: number; // hora local do resumo diário
  timezone: string;
  /** zonas problemáticas por ordem de prioridade (ids de FunctionalArea) */
  functionalAreas: string[];
  functionalLevel: "beginner" | "intermediate" | "advanced";
  /** material disponível além do peso corporal */
  functionalEquipment: string[];
  /** quando o assistente inicial foi concluído (null = ainda não) */
  onboardedAt?: string | null;
}

export const DEFAULT_PROFILE: AthleteProfile = {
  name: "Atleta",
  ftp: 260,
  runThresholdPace: 255,
  css: 95,
  hrMax: 188,
  lthr: 168,
  weight: 72,
  sleepTargetH: 8,
  seasonStartMonth: 10,
  weights: { hrv: 30, sleep: 25, tsb: 20, rhr: 15, energy: 10, feel: 10 },
  notifyEnabled: false,
  notifyHour: 7,
  timezone: "Europe/Lisbon",
  functionalAreas: [],
  functionalLevel: "intermediate",
  functionalEquipment: ["band", "step"],
  onboardedAt: null,
};

export type SuggestionStatus = "new" | "followed" | "ignored" | "not_applicable";

export interface Suggestion {
  id: string; // `${rule}:${date}`
  rule: string;
  date: string;
  severity: "info" | "warn" | "alert";
  title: string;
  action: string;
  reason: string;
  confidence: "baixa" | "média" | "alta";
  data?: Record<string, number | string | null>;
  status?: SuggestionStatus;
}

export interface DashboardWidget {
  i: string;
  type: string;
  config: Record<string, any>;
}

export interface LayoutItem { i: string; x: number; y: number; w: number; h: number; }

export interface Dashboard {
  id: string;
  name: string;
  isDefault: boolean;
  widgets: DashboardWidget[];
  layouts: { lg: LayoutItem[]; md?: LayoutItem[]; sm?: LayoutItem[] };
}

export interface GarminConnection {
  status: "not_connected" | "connected" | "error" | "expired";
  keyExpiresAt?: string | null;
  lastSyncAt?: string | null;
  backfillFrom?: string | null;
  backfillCursor?: string | null;
  backfillDone?: boolean;
  lastError?: string | null;
}

// ───────────── Fase 2 ─────────────

export type RaceDistance = "sprint" | "olympic" | "half" | "full" | "other";
export const RACE_DISTANCE_LABEL: Record<RaceDistance, string> = {
  sprint: "Sprint", olympic: "Olímpico", half: "Meio Ironman (70.3)", full: "Ironman", other: "Outra",
};

export interface Race {
  id: string;
  date: string;
  name: string;
  distance: RaceDistance;
  priority: "A" | "B" | "C";
  goalTimeS?: number | null;
  resultTimeS?: number | null;
  location?: string | null;
  notes?: string | null;
}

export type Phase = "transition" | "base" | "build" | "peak" | "taper" | "race" | "recovery";
export const PHASE_LABEL: Record<Phase, string> = {
  transition: "Transição", base: "Base", build: "Construção", peak: "Pico", taper: "Taper", race: "Prova", recovery: "Recuperação",
};

export type StepIntensity = "warmup" | "active" | "recovery" | "cooldown" | "rest";
export interface StepTarget { type: "open" | "hr" | "power" | "pace"; low?: number; high?: number } // hr bpm · power W · pace s/km (corrida) ou s/100m (natação)
export interface SimpleStep { kind: "step"; intensity: StepIntensity; durationS?: number; distanceM?: number; target: StepTarget; name?: string }
export interface RepeatStep { kind: "repeat"; times: number; steps: SimpleStep[] }
export type WorkoutStep = SimpleStep | RepeatStep;

export interface PlannedSession {
  id: string;
  date: string;
  sport: Sport;
  type: SessionType;
  durationMin: number;
  tss?: number | null;
  title: string;
  description?: string | null;
  steps?: WorkoutStep[] | null;
}

export interface CheckIn {
  date: string;
  energy: number; // 1–5
  soreness: number; // 1–5 (5 = muito dorido)
  mood: number; // 1–5
  motivation: number; // 1–5
  notes?: string | null;
}

export interface Lap { index: number; startS: number; durationS: number; distanceM: number; avgHr?: number | null; avgPower?: number | null; avgSpeed?: number | null }

/** Séries temporais de uma atividade, reamostradas (uma amostra a cada `sampleS` segundos). */
export interface ActivityStreams {
  activityId: string;
  sampleS: number;
  t: number[];
  hr?: (number | null)[];
  power?: (number | null)[];
  speed?: (number | null)[]; // m/s
  cadence?: (number | null)[];
  alt?: (number | null)[];
  dist?: (number | null)[]; // m acumulados
  laps: Lap[];
}

/** Registo de uma rotina funcional feita. */
export interface FunctionalLog { date: string; mode: "full" | "short" | "mobility"; minutes: number; exercises: string[]; areas: string[] }
