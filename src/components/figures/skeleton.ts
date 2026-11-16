// Figura humana esquemática (cinemática direta) para ilustrar exercícios.
// Ângulos em graus no referencial do SVG: 0 = direita, 90 = baixo, 180 = esquerda, -90 = cima.

export const FLOOR = 112;
export const FRAME_W = 160;
export const FRAME_H = 124;

const L = { trunk: 29, neck: 5, head: 6, upperArm: 15, forearm: 13, thigh: 21, shin: 21, foot: 7 };

export type Pt = [number, number];
export type JointName =
  | "hip" | "shoulder" | "neck" | "head"
  | "elbowN" | "handN" | "elbowF" | "handF"
  | "kneeN" | "ankleN" | "toeN" | "kneeF" | "ankleF" | "toeF"
  | "hipN" | "hipF" | "shoulderN" | "shoulderF";

export interface PoseSpec {
  /** ângulo anca → ombro */
  trunk: number;
  /** curvatura da coluna (px; + = para o lado esquerdo da direção do tronco) */
  bend?: number;
  /** ângulo do pescoço/cabeça (por defeito igual ao tronco) */
  neck?: number;
  armN: [number, number];
  armF?: [number, number] | null;
  legN: [number, number, number];
  legF?: [number, number, number] | null;
  /** coloca a figura de modo a que a articulação fique neste ponto */
  anchor: [JointName, number, number];
  /** vista de frente/cima: membros dos dois lados visíveis e afastados */
  front?: boolean;
  /** encurta o tronco (ex.: pessoa sentada vista de cima) */
  trunkScale?: number;
}

export type Joints = Record<JointName, Pt>;

const rad = (d: number) => (d * Math.PI) / 180;
const step = (p: Pt, ang: number, len: number): Pt => [p[0] + len * Math.cos(rad(ang)), p[1] + len * Math.sin(rad(ang))];

export function computeJoints(p: PoseSpec): Joints {
  const hip: Pt = [0, 0];
  const ts = p.trunkScale ?? 1;
  const shoulder = step(hip, p.trunk, L.trunk * ts);
  const neckA = p.neck ?? p.trunk;
  const neck = step(shoulder, neckA, L.neck * ts);
  const head = step(neck, neckA, L.head);
  // em vista de frente, ancas e ombros afastados na perpendicular do tronco
  const perp = p.trunk + 90;
  const hipN = p.front ? step(hip, perp, 6) : hip;
  const hipF = p.front ? step(hip, perp + 180, 6) : hip;
  const shoulderN = p.front ? step(shoulder, perp, 9) : shoulder;
  const shoulderF = p.front ? step(shoulder, perp + 180, 9) : shoulder;
  const armF = p.armF ?? p.armN;
  const legF = p.legF ?? p.legN;
  const elbowN = step(shoulderN, p.armN[0], L.upperArm), handN = step(elbowN, p.armN[1], L.forearm);
  const elbowF = step(shoulderF, armF[0], L.upperArm), handF = step(elbowF, armF[1], L.forearm);
  const kneeN = step(hipN, p.legN[0], L.thigh), ankleN = step(kneeN, p.legN[1], L.shin), toeN = step(ankleN, p.legN[2], L.foot);
  const kneeF = step(hipF, legF[0], L.thigh), ankleF = step(kneeF, legF[1], L.shin), toeF = step(ankleF, legF[2], L.foot);
  const j: Joints = { hip, shoulder, neck, head, hipN, hipF, shoulderN, shoulderF, elbowN, handN, elbowF, handF, kneeN, ankleN, toeN, kneeF, ankleF, toeF };
  const [name, x, y] = p.anchor;
  const dx = x - j[name][0], dy = y - j[name][1];
  for (const k of Object.keys(j) as JointName[]) j[k] = [j[k][0] + dx, j[k][1] + dy];
  return j;
}

export const HEAD_R = L.head;

// ───────────── Material e anotações ─────────────

export type PtRef = Pt | JointName;

export type Prop =
  | { kind: "step"; x: number; w: number; h: number }
  | { kind: "bench"; x: number; w: number; h: number }
  | { kind: "wall"; x: number }
  | { kind: "post"; x: number; h?: number }
  | { kind: "band"; from: PtRef; to: PtRef }
  | { kind: "weight"; at: PtRef }
  | { kind: "ball"; at: PtRef; r?: number }
  | { kind: "slider"; at: PtRef }
  | { kind: "towel"; at: PtRef }
  | { kind: "bar"; at: PtRef } // apoio para os pés (Nordic)
  | { kind: "arrow"; from: PtRef; to: PtRef; curve?: number }
  | { kind: "label"; at: Pt; text: string };

export interface Frame { pose: PoseSpec; props?: Prop[]; caption?: string }

export interface Figure {
  /** "top" = vista de cima (sem chão) */
  view?: "side" | "front" | "top";
  frames: Frame[];
}

export function resolve(p: PtRef, j: Joints): Pt {
  return typeof p === "string" ? j[p] : p;
}
