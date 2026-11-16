// Codificador mínimo de ficheiros FIT de treino estruturado (workout), para importar no Garmin Connect.
// Mensagens: file_id (0), workout (26), workout_step (27). Referência: Garmin FIT SDK, Profile.xlsx.
import type { PlannedSession, SimpleStep, Sport, StepTarget, WorkoutStep } from "../types";

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
export function fitCrc(bytes: Uint8Array, crc = 0): number {
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

// tipos base FIT
const ENUM = 0x00, UINT16 = 0x84, UINT32 = 0x86, STRING = 0x07;
type Field = { num: number; type: number; size: number; value: number | string | null };

const FIT_SPORT: Record<Sport, [number, number]> = { run: [1, 0], bike: [2, 0], swim: [5, 17], brick: [10, 0], strength: [10, 20], other: [0, 0] }; // [sport, sub_sport] (swim/lap_swimming=17, training/strength=20)
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 } as const;
const FIT_EPOCH = Date.UTC(1989, 11, 31, 0, 0, 0);

class Writer {
  private chunks: number[] = [];
  private defined = new Map<string, number>();
  private nextLocal = 0;
  u8(v: number) { this.chunks.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u32(v: number) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); }
  str(v: string, size: number) { const b = new TextEncoder().encode(v).slice(0, size - 1); for (let i = 0; i < size; i++) this.u8(i < b.length ? b[i] : 0); }
  message(global: number, fields: Field[]) {
    const sig = global + ":" + fields.map((f) => `${f.num}/${f.size}/${f.type}`).join(",");
    let local = this.defined.get(sig);
    if (local == null) {
      local = this.nextLocal++ % 16;
      this.defined.set(sig, local);
      this.u8(0x40 | local); this.u8(0); this.u8(0); this.u16(global); this.u8(fields.length);
      for (const f of fields) { this.u8(f.num); this.u8(f.size); this.u8(f.type); }
    }
    this.u8(local);
    for (const f of fields) {
      if (f.type === STRING) this.str(String(f.value ?? ""), f.size);
      else if (f.size === 1) this.u8(f.value == null ? 0xff : Number(f.value));
      else if (f.size === 2) this.u16(f.value == null ? 0xffff : Number(f.value));
      else this.u32(f.value == null ? 0xffffffff : Number(f.value));
    }
  }
  bytes() { return Uint8Array.from(this.chunks); }
}

/** Alvo do passo → [target_type, target_value, low, high] nas unidades FIT. */
function fitTarget(t: StepTarget, sport: Sport): [number, number, number | null, number | null] {
  if (t.type === "power" && t.low && t.high) return [4, 0, t.low + 1000, t.high + 1000]; // W + 1000
  if (t.type === "hr" && t.low && t.high) return [1, 0, t.low + 100, t.high + 100]; // bpm + 100
  if (t.type === "pace" && t.low && t.high && sport !== "swim") {
    // ritmo s/km → velocidade mm/s (o ritmo mais lento é a velocidade baixa)
    const toSpeed = (sPerKm: number) => Math.round((1000 / sPerKm) * 1000);
    return [0, 0, toSpeed(t.high), toSpeed(t.low)];
  }
  return [2, 0, null, null]; // aberto (natação: o ritmo vai nas notas)
}

function flatten(steps: WorkoutStep[]): { step: SimpleStep | null; repeat?: { from: number; times: number } }[] {
  const out: { step: SimpleStep | null; repeat?: { from: number; times: number } }[] = [];
  for (const s of steps) {
    if (s.kind === "repeat") {
      const from = out.length;
      for (const x of s.steps) out.push({ step: x });
      out.push({ step: null, repeat: { from, times: s.times } });
    } else out.push({ step: s });
  }
  return out;
}

export function encodeWorkoutFit(session: PlannedSession, now = Date.now()): Uint8Array {
  const w = new Writer();
  const [sport, subSport] = FIT_SPORT[session.sport];
  const flat = flatten(session.steps?.length ? session.steps : [{ kind: "step", intensity: "active", durationS: session.durationMin * 60, target: { type: "open" } }]);
  const created = Math.round((now - FIT_EPOCH) / 1000);

  w.message(0, [
    { num: 0, type: ENUM, size: 1, value: 5 }, // type = workout
    { num: 1, type: UINT16, size: 2, value: 255 }, // manufacturer = development
    { num: 2, type: UINT16, size: 2, value: 0 }, // product
    { num: 4, type: UINT32, size: 4, value: created }, // time_created
  ]);
  w.message(26, [
    { num: 4, type: ENUM, size: 1, value: sport },
    { num: 11, type: ENUM, size: 1, value: subSport },
    { num: 6, type: UINT16, size: 2, value: flat.length }, // num_valid_steps
    { num: 8, type: STRING, size: 32, value: session.title }, // wkt_name
  ]);
  flat.forEach((f, i) => {
    if (f.repeat) {
      w.message(27, [
        { num: 254, type: UINT16, size: 2, value: i },
        { num: 0, type: STRING, size: 16, value: `Repetir ${f.repeat.times}x` },
        { num: 1, type: ENUM, size: 1, value: 6 }, // repeat_until_steps_cmplt
        { num: 2, type: UINT32, size: 4, value: f.repeat.from },
        { num: 3, type: ENUM, size: 1, value: 2 },
        { num: 4, type: UINT32, size: 4, value: f.repeat.times },
        { num: 5, type: UINT32, size: 4, value: null },
        { num: 6, type: UINT32, size: 4, value: null },
        { num: 7, type: ENUM, size: 1, value: 0 },
        { num: 8, type: STRING, size: 32, value: "" },
      ]);
      return;
    }
    const s = f.step!;
    const [tt, tv, lo, hi] = fitTarget(s.target, session.sport);
    const [dt, dv] = s.durationS ? [0, s.durationS * 1000] : s.distanceM ? [1, Math.round(s.distanceM * 100)] : [5, 0]; // time ms · distance cm · open
    const note = s.target.type === "pace" && session.sport === "swim" && s.target.low ? `Ritmo ${fmt(s.target.low)}–${fmt(s.target.high!)} /100m` : "";
    w.message(27, [
      { num: 254, type: UINT16, size: 2, value: i },
      { num: 0, type: STRING, size: 16, value: s.name ?? "" },
      { num: 1, type: ENUM, size: 1, value: dt },
      { num: 2, type: UINT32, size: 4, value: dv },
      { num: 3, type: ENUM, size: 1, value: tt },
      { num: 4, type: UINT32, size: 4, value: tv },
      { num: 5, type: UINT32, size: 4, value: lo },
      { num: 6, type: UINT32, size: 4, value: hi },
      { num: 7, type: ENUM, size: 1, value: INTENSITY[s.intensity] },
      { num: 8, type: STRING, size: 32, value: note },
    ]);
  });

  const data = w.bytes();
  const header = new Uint8Array(14);
  const dv = new DataView(header.buffer);
  header[0] = 14; header[1] = 0x20; dv.setUint16(2, 2132, true); dv.setUint32(4, data.length, true);
  header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  dv.setUint16(12, fitCrc(header.subarray(0, 12)), true);
  const out = new Uint8Array(14 + data.length + 2);
  out.set(header); out.set(data, 14);
  const crc = fitCrc(out.subarray(0, 14 + data.length));
  out[out.length - 2] = crc & 0xff; out[out.length - 1] = crc >> 8;
  return out;
}

function fmt(s: number) { return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`; }
