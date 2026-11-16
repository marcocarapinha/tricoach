// Poses (início → fim) de cada exercício da biblioteca funcional.
// Figura de perfil virada para a direita, salvo indicação. Comprimentos: tronco 29, coxa 21, perna 21, braço 15+13.
import { FLOOR as F, type Figure, type PoseSpec } from "./skeleton";

type P = Partial<PoseSpec>;
const mk = (base: PoseSpec, o: P = {}): PoseSpec => ({ ...base, ...o });

// ───────────── Posições base ─────────────
/** de pé, de perfil (tornozelo em x) */
const st = (x: number, o: P = {}) => mk({ trunk: -90, armN: [78, 66], armF: [104, 114], legN: [90, 90, 0], legF: [90, 90, 0], anchor: ["ankleN", x, F - 2.5] }, o);
/** em pontas de pés (dedos em x, à altura y) */
const toes = (x: number, y = F - 1, o: P = {}) => mk({ trunk: -90, armN: [78, 66], armF: [104, 114], legN: [90, 90, 62], legF: [90, 90, 62], anchor: ["toeN", x, y] }, o);
/** deitado de costas, cabeça à esquerda, joelhos fletidos */
const sup = (x: number, o: P = {}) => mk({ trunk: 180, neck: 180, armN: [3, 0], armF: [3, 0], legN: [-55, 55, 0], legF: [-55, 55, 0], anchor: ["hip", x, F - 4] }, o);
/** ponte: ombros no chão, anca elevada */
const bridge = (x: number, o: P = {}) => mk({ trunk: 150, neck: 180, armN: [6, 0], armF: [6, 0], legN: [-15, 80, 0], legF: [-15, 80, 0], anchor: ["shoulder", x, F - 4] }, o);
/** deitado de barriga para baixo, cabeça à esquerda */
const prone = (x: number, o: P = {}) => mk({ trunk: 180, neck: 182, armN: [180, 180], armF: [180, 180], legN: [0, 0, 80], legF: [0, 0, 80], anchor: ["hip", x, F - 4] }, o);
/** quatro apoios (joelho em x) */
const quad = (x: number, o: P = {}) => mk({ trunk: -12, neck: -15, armN: [90, 90], armF: [90, 90], legN: [90, 180, 180], legF: [90, 180, 180], anchor: ["kneeN", x, F - 2] }, o);
/** prancha alta (mão em x) */
const plank = (x: number, o: P = {}) => mk({ trunk: -21, neck: -21, armN: [90, 90], armF: [90, 90], legN: [159, 159, 75], legF: [159, 159, 75], anchor: ["handN", x, F - 1] }, o);
/** sentado num banco (anca em x) com altura h */
const sit = (x: number, h = 23, o: P = {}) => mk({ trunk: -90, armN: [80, 20], armF: [80, 20], legN: [0, 90, 0], legF: [0, 90, 0], anchor: ["hip", x, F - h - 2] }, o);
/** de joelhos, tronco direito (joelho em x) */
const kneel = (x: number, o: P = {}) => mk({ trunk: -90, armN: [78, 66], armF: [104, 114], legN: [90, 180, 180], legF: [90, 180, 180], anchor: ["kneeN", x, F - 2] }, o);
/** de pé, de frente */
const fr = (x: number, o: P = {}) => mk({ front: true, trunk: -90, armN: [76, 88], armF: [104, 92], legN: [92, 90, 20], legF: [88, 90, 160], anchor: ["ankleN", x + 7, F - 2.5] }, o);
/** vista de cima, deitado de barriga para baixo (cabeça em cima) */
const top = (o: P = {}) => mk({ front: true, trunk: -90, armN: [30, 30], armF: [150, 150], legN: [92, 90, 90], legF: [88, 90, 90], anchor: ["hip", 80, 62] }, o);

const STEP = { kind: "step" as const, x: 88, w: 62, h: 12 };

// ───────────── Figuras ─────────────
export const FIGURES: Record<string, Figure> = {
  // ── Aquiles / gémeos / pé ──
  heel_drop_straight: { frames: [
    { pose: toes(95, F - 12, { legN: [90, 90, 55], legF: [90, 90, 55] }), props: [STEP], caption: "sobe com os dois pés" },
    { pose: toes(95, F - 12, { legN: [90, 90, -32], legF: [95, 175, 180] }), props: [STEP, { kind: "arrow", from: [80, 90], to: [80, 108] }], caption: "desce só com um, em 3 s" },
  ] },
  heel_drop_bent: { frames: [
    { pose: toes(95, F - 12, { trunk: -95, legN: [70, 112, 55], legF: [70, 112, 55] }), props: [STEP], caption: "joelhos fletidos" },
    { pose: toes(95, F - 12, { trunk: -95, legN: [70, 112, -32], legF: [90, 175, 180] }), props: [STEP, { kind: "arrow", from: [80, 92], to: [80, 108] }], caption: "desce em 3 s" },
  ] },
  calf_iso: { frames: [
    { pose: st(80), caption: "de pé" },
    { pose: toes(84, F - 1, { legN: [90, 90, 48], legF: [90, 90, 48] }), props: [{ kind: "arrow", from: [64, 108], to: [64, 92] }], caption: "pontas a meio e mantém" },
  ] },
  sl_calf_raise: { frames: [
    { pose: st(80, { legF: [100, 150, 165] }), caption: "num pé" },
    { pose: toes(84, F - 1, { legN: [90, 90, 62], legF: [100, 150, 165] }), props: [{ kind: "arrow", from: [64, 108], to: [64, 92] }], caption: "sobe 1 s, desce 3 s" },
  ] },
  soleus_wall_sit: { frames: [
    { pose: mk({ trunk: -90, armN: [90, 90], armF: [90, 90], legN: [0, 90, 0], legF: [0, 90, 0], anchor: ["ankleN", 66, F - 2.5] }), props: [{ kind: "wall", x: 40 }], caption: "costas na parede" },
    { pose: mk({ trunk: -90, armN: [90, 90], armF: [90, 90], legN: [0, 82, 60], legF: [0, 82, 60], anchor: ["toeN", 70, F - 1] }), props: [{ kind: "wall", x: 40 }, { kind: "arrow", from: [88, 108], to: [88, 96] }], caption: "calcanhares no ar" },
  ] },
  short_foot: { frames: [
    { pose: sit(60, 23, { legN: [0, 90, 0], legF: [8, 92, 0] }), props: [{ kind: "bench", x: 40, w: 34, h: 23 }], caption: "sentado, pé relaxado" },
    { pose: sit(60, 23, { legN: [0, 90, 0], legF: [8, 92, 0] }), props: [{ kind: "bench", x: 40, w: 34, h: 23 }, { kind: "arrow", from: [86, 106], to: [86, 98], curve: 2 }, { kind: "label", at: [112, 96], text: "arco ativo" }], caption: "encurta o pé sem dobrar os dedos" },
  ] },
  rathleff: { frames: [
    { pose: toes(97, F - 15, { legN: [90, 90, -20], legF: [90, 90, -20] }), props: [STEP, { kind: "towel", at: [98, 97] }], caption: "dedos sobre a toalha" },
    { pose: toes(97, F - 15, { legN: [90, 90, 55], legF: [90, 90, 55] }), props: [STEP, { kind: "towel", at: [98, 97] }, { kind: "arrow", from: [72, 100], to: [72, 84] }], caption: "3 s a subir, 3 s a descer" },
  ] },
  knee_to_wall: { frames: [
    { pose: mk({ trunk: -88, armN: [10, -10], armF: [10, -10], legN: [65, 100, 0], legF: [120, 115, -10], anchor: ["ankleN", 100, F - 2.5] }), props: [{ kind: "wall", x: 128 }], caption: "pé a um palmo da parede" },
    { pose: mk({ trunk: -84, armN: [5, -15], armF: [5, -15], legN: [50, 70, 0], legF: [118, 118, -10], anchor: ["ankleN", 100, F - 2.5] }), props: [{ kind: "wall", x: 128 }, { kind: "arrow", from: [104, 76], to: [122, 76] }], caption: "joelho à parede, calcanhar no chão" },
  ] },

  // ── Posterior da coxa ──
  nordic: { frames: [
    { pose: kneel(70), props: [{ kind: "bar", at: "ankleN" }], caption: "de joelhos, pés presos" },
    { pose: kneel(70, { trunk: -55, neck: -55, legN: [125, 180, 180], legF: [125, 180, 180], armN: [70, 40], armF: [70, 40] }), props: [{ kind: "bar", at: "ankleN" }, { kind: "arrow", from: [104, 40], to: [124, 70], curve: -6 }], caption: "desce o mais devagar possível" },
  ] },
  slider_curl: { frames: [
    { pose: bridge(40), props: [{ kind: "slider", at: "ankleN" }], caption: "ponte, calcanhares nos deslizadores" },
    { pose: bridge(40, { trunk: 170, legN: [3, 3, -70], legF: [3, 3, -70] }), props: [{ kind: "slider", at: "ankleN" }, { kind: "arrow", from: [110, 100], to: [136, 100] }], caption: "estica em 3 s sem baixar a anca" },
  ] },
  sl_rdl: { frames: [
    { pose: st(70, { legF: [95, 92, 0] }), caption: "apoio numa perna" },
    { pose: mk({ trunk: -4, neck: -4, armN: [90, 90], armF: [90, 90], legN: [95, 82, 0], legF: [180, 180, 100], anchor: ["ankleN", 70, F - 2.5] }), props: [{ kind: "arrow", from: [100, 34], to: [110, 52], curve: -4 }], caption: "anca atrás, tronco e perna em linha" },
  ] },
  bridge_walkout: { frames: [
    { pose: bridge(40), caption: "ponte" },
    { pose: bridge(40, { trunk: 165, legN: [-2, 50, 0], legF: [-2, 50, 0] }), props: [{ kind: "arrow", from: [100, 112 - 12], to: [130, 100] }], caption: "pés para a frente sem a anca descer" },
  ] },
  iso_bridge_heel: { frames: [
    { pose: sup(80, { legN: [-35, 40, -60], legF: [-35, 40, -60] }), caption: "calcanhares longe, pontas no ar" },
    { pose: bridge(40, { trunk: 160, legN: [-8, 55, -60], legF: [-8, 55, -60] }), props: [{ kind: "arrow", from: [62, 104], to: [62, 88] }], caption: "sobe a anca e mantém" },
  ] },
  hamstring_floss: { frames: [
    { pose: sit(60, 23, { neck: -60, trunk: -80, legN: [5, 100, 0] }), props: [{ kind: "bench", x: 40, w: 34, h: 23 }], caption: "joelho fletido, cabeça para baixo" },
    { pose: sit(60, 23, { neck: -115, trunk: -95, legN: [5, 5, -70] }), props: [{ kind: "bench", x: 40, w: 34, h: 23 }, { kind: "arrow", from: [96, 112 - 6], to: [112, 86], curve: 6 }], caption: "estica o joelho e levanta a cabeça" },
  ] },

  // ── Joelho ──
  spanish_squat: { frames: [
    { pose: st(80, { armN: [20, 0], armF: [20, 0] }), props: [{ kind: "post", x: 22, h: 60 }, { kind: "band", from: [22, 72], to: "kneeN" }], caption: "elástico atrás dos joelhos" },
    { pose: mk({ trunk: -80, armN: [10, 0], armF: [10, 0], legN: [180, 90, 0], legF: [180, 90, 0], anchor: ["ankleN", 80, F - 2.5] }), props: [{ kind: "post", x: 22, h: 60 }, { kind: "band", from: [22, 72], to: "kneeN" }], caption: "senta para trás, canelas verticais" },
  ] },
  step_down: { frames: [
    { pose: st(104, { legF: [80, 98, 0], anchor: ["ankleN", 104, F - 12.5] }), props: [{ kind: "step", x: 66, w: 48, h: 10 }], caption: "num pé, na borda do degrau" },
    { pose: mk({ trunk: -76, armN: [15, 0], armF: [15, 0], legN: [45, 135, 0], legF: [60, 85, -10], anchor: ["ankleN", 104, F - 12.5] }), props: [{ kind: "step", x: 66, w: 48, h: 10 }, { kind: "arrow", from: [132, 84], to: [132, 104] }], caption: "toca com o calcanhar livre em 3 s" },
  ] },
  wall_sit: { frames: [
    { pose: st(56, { armN: [90, 90], armF: [90, 90] }), props: [{ kind: "wall", x: 40 }], caption: "costas na parede" },
    { pose: mk({ trunk: -90, armN: [90, 90], armF: [90, 90], legN: [0, 90, 0], legF: [0, 90, 0], anchor: ["ankleN", 68, F - 2.5] }), props: [{ kind: "wall", x: 40 }, { kind: "arrow", from: [100, 50], to: [100, 74] }], caption: "joelhos a 90°, mantém" },
  ] },

  // ── Anca / glúteos / adutores ──
  clamshell: { frames: [
    { pose: mk({ trunk: 180, neck: 200, armN: [10, 0], armF: [220, 340], legN: [-40, 60, 0], legF: [-40, 60, 0], anchor: ["hip", 82, F - 6] }), props: [{ kind: "band", from: "kneeN", to: "kneeF" }], caption: "de lado, joelhos fletidos" },
    { pose: mk({ trunk: 180, neck: 200, armN: [10, 0], armF: [220, 340], legN: [-80, 40, 0], legF: [-40, 60, 0], anchor: ["hip", 82, F - 6] }), props: [{ kind: "band", from: "kneeN", to: "kneeF" }, { kind: "arrow", from: [108, 86], to: [92, 66], curve: 4 }], caption: "abre o joelho de cima" },
  ] },
  side_abduction: { frames: [
    { pose: mk({ trunk: 180, neck: 200, armN: [10, 0], armF: [220, 340], legN: [0, 0, -70], legF: [0, 0, -70], anchor: ["hip", 72, F - 6] }), caption: "deitado de lado" },
    { pose: mk({ trunk: 180, neck: 200, armN: [10, 0], armF: [220, 340], legN: [-30, -30, -100], legF: [0, 0, -70], anchor: ["hip", 72, F - 6] }), props: [{ kind: "arrow", from: [118, 98], to: [112, 76], curve: -4 }], caption: "sobe a perna, calcanhar à frente" },
  ] },
  sl_bridge: { frames: [
    { pose: sup(78, { legN: [-55, 55, 0], legF: [-20, -20, -70] }), caption: "uma perna esticada" },
    { pose: bridge(40, { legF: [-28, -28, -100] }), props: [{ kind: "arrow", from: [62, 104], to: [62, 88] }], caption: "sobe a anca, bacia nivelada" },
  ] },
  monster_walk: { view: "front", frames: [
    { pose: fr(70, { trunk: -90, legN: [80, 100, 20], legF: [100, 80, 160], anchor: ["ankleN", 84, F - 2.5] }), props: [{ kind: "band", from: "ankleN", to: "ankleF" }], caption: "meio agachamento" },
    { pose: fr(70, { trunk: -90, legN: [62, 105, 20], legF: [110, 80, 160], anchor: ["ankleN", 98, F - 2.5] }), props: [{ kind: "band", from: "ankleN", to: "ankleF" }, { kind: "arrow", from: [100, 92], to: [122, 92] }], caption: "passo lateral, joelhos para fora" },
  ] },
  copenhagen: { frames: [
    { pose: mk({ trunk: -30, neck: -30, armN: [90, 0], armF: [45, 180], legN: [178, 178, 180], legF: [150, 210, 180], anchor: ["ankleN", 26, F - 26] }), props: [{ kind: "bench", x: 10, w: 34, h: 24 }], caption: "perna de cima no banco" },
    { pose: mk({ trunk: -6, neck: -6, armN: [90, 0], armF: [45, 180], legN: [182, 182, 180], legF: [140, 220, 180], anchor: ["ankleN", 26, F - 26] }), props: [{ kind: "bench", x: 10, w: 34, h: 24 }, { kind: "arrow", from: [80, 104], to: [80, 88] }], caption: "sobe a anca e mantém" },
  ] },
  adductor_squeeze: { frames: [
    { pose: sup(80), props: [{ kind: "ball", at: "kneeN", r: 5 }], caption: "bola entre os joelhos" },
    { pose: sup(80), props: [{ kind: "ball", at: "kneeN", r: 3.5 }, { kind: "label", at: [92, 76], text: "aperta 70%" }], caption: "aperta e mantém" },
  ] },

  // ── Lombar / core ──
  dead_bug: { frames: [
    { pose: sup(84, { armN: [-90, -90], armF: [-90, -90], legN: [-90, 0, -80], legF: [-90, 0, -80] }), caption: "braços ao teto, 90/90" },
    { pose: sup(84, { armN: [-90, -90], armF: [-165, -165], legN: [-6, -6, -70], legF: [-90, 0, -80] }), props: [{ kind: "arrow", from: [120, 74], to: [134, 100], curve: -6 }], caption: "estende braço e perna opostos" },
  ] },
  bird_dog: { frames: [
    { pose: quad(56), caption: "quatro apoios" },
    { pose: quad(56, { armN: [-5, -5], legF: [182, 182, 180] }), props: [{ kind: "arrow", from: [112, 60], to: [128, 60] }, { kind: "arrow", from: [36, 82], to: [20, 82] }], caption: "braço e perna opostos em linha" },
  ] },
  side_plank: { frames: [
    { pose: mk({ trunk: -27, neck: -27, armN: [90, 0], armF: [60, 160], legN: [180, 180, 175], legF: [180, 180, 175], anchor: ["elbowN", 100, F - 2] }), caption: "de lado, cotovelo sob o ombro" },
    { pose: mk({ trunk: -11, neck: -11, armN: [90, 0], armF: [60, 160], legN: [169, 169, 175], legF: [169, 169, 175], anchor: ["elbowN", 100, F - 2] }), props: [{ kind: "arrow", from: [66, 104], to: [66, 92] }], caption: "anca em cima, corpo em linha" },
  ] },
  mcgill_curl: { frames: [
    { pose: sup(84, { armN: [15, 0], legN: [-55, 55, 0], legF: [0, 0, -70] }), caption: "mãos sob a lombar" },
    { pose: sup(84, { armN: [15, 0], neck: 165, trunk: 176, legN: [-55, 55, 0], legF: [0, 0, -70] }), props: [{ kind: "arrow", from: [38, 100], to: [38, 88] }], caption: "levanta só cabeça e ombros, 10 s" },
  ] },
  pallof: { frames: [
    { pose: st(80, { armN: [70, -70], armF: [70, -70], legN: [80, 100, 0], legF: [100, 80, 0] }), props: [{ kind: "post", x: 20, h: 70 }, { kind: "band", from: [20, 50], to: "handN" }], caption: "mãos ao peito" },
    { pose: st(80, { armN: [-2, -2], armF: [-2, -2], legN: [80, 100, 0], legF: [100, 80, 0] }), props: [{ kind: "post", x: 20, h: 70 }, { kind: "band", from: [20, 50], to: "handN" }, { kind: "arrow", from: [92, 40], to: [116, 40] }], caption: "empurra sem rodar o tronco" },
  ] },

  // ── Ombros / pescoço ──
  band_er: { view: "top", frames: [
    { pose: mk({ front: true, trunk: -90, armN: [90, -90], armF: [90, -90], legN: [92, 90, 90], legF: [88, 90, 90], anchor: ["hip", 80, 66] }), caption: "vista de cima: cotovelos ao corpo" },
    { pose: mk({ front: true, trunk: -90, armN: [90, -30], armF: [90, -150], legN: [92, 90, 90], legF: [88, 90, 90], anchor: ["hip", 80, 66] }), props: [{ kind: "band", from: "handN", to: "handF" }, { kind: "arrow", from: [102, 46], to: [114, 38], curve: 2 }, { kind: "arrow", from: [58, 46], to: [46, 38], curve: -2 }], caption: "roda os antebraços para fora" },
  ] },
  ytw: { view: "top", frames: [
    { pose: top({ armN: [-60, -60], armF: [-120, -120] }), caption: "Y" },
    { pose: top({ armN: [0, 0], armF: [180, 180] }), caption: "T" },
    { pose: top({ armN: [30, -60], armF: [150, -120] }), caption: "W" },
  ] },
  scap_pushup: { frames: [
    { pose: plank(110, { bend: -2 }), caption: "omoplatas juntas" },
    { pose: plank(110, { bend: 4 }), props: [{ kind: "arrow", from: [100, 70], to: [100, 58] }], caption: "empurra o chão, costas arredondam" },
  ] },
  pull_apart: { frames: [
    { pose: st(70, { armN: [-2, -2], armF: [-2, -2] }), props: [{ kind: "label", at: [80, 16], text: "de perfil" }], caption: "braços esticados à frente" },
    { pose: fr(70, { armN: [0, 0], armF: [180, 180] }), props: [{ kind: "band", from: "handN", to: "handF" }, { kind: "label", at: [80, 16], text: "de frente" }], caption: "abre até ao peito" },
  ] },
  chin_tuck: { frames: [
    { pose: st(80, { neck: -60 }), caption: "cabeça para a frente" },
    { pose: st(80, { neck: -96 }), props: [{ kind: "arrow", from: [100, 22], to: [88, 22] }], caption: "queixo para trás, 5 s" },
  ] },
  open_book: { view: "top", frames: [
    { pose: mk({ trunk: 180, neck: 180, armN: [90, 90], armF: [90, 90], legN: [80, 10, 10], legF: [80, 10, 10], anchor: ["hip", 96, 50] }), caption: "vista de cima: de lado, braços à frente" },
    { pose: mk({ trunk: 180, neck: 160, armN: [90, 90], armF: [-90, -90], legN: [80, 10, 10], legF: [80, 10, 10], anchor: ["hip", 96, 50] }), props: [{ kind: "arrow", from: [56, 82], to: [56, 20], curve: 22 }], caption: "abre o braço de cima e segue-o" },
  ] },

  // ── Mobilidade ──
  hip_flexor: { frames: [
    { pose: mk({ trunk: -90, armN: [96, 84], armF: [84, 96], legN: [0, 90, 0], legF: [95, 180, 180], anchor: ["kneeF", 70, F - 2] }), caption: "meio-ajoelhado" },
    { pose: mk({ trunk: -96, armN: [96, 84], armF: [84, 96], legN: [-8, 98, 0], legF: [108, 180, 180], anchor: ["kneeF", 70, F - 2] }), props: [{ kind: "arrow", from: [74, 62], to: [86, 62] }], caption: "encaixa a bacia e avança" },
  ] },
  ninety_ninety: { view: "top", frames: [
    { pose: mk({ front: true, trunkScale: 0.12, trunk: -90, armN: [-30, -30], armF: [-150, -150], legN: [90, 180, 180], legF: [180, -90, -90], anchor: ["hip", 86, 54] }), caption: "vista de cima: pernas a 90°/90°" },
    { pose: mk({ front: true, trunkScale: 0.12, trunk: -90, armN: [-30, -30], armF: [-150, -150], legN: [0, -90, -90], legF: [90, 0, 0], anchor: ["hip", 74, 54] }), props: [{ kind: "arrow", from: [40, 100], to: [120, 100], curve: 14 }], caption: "roda os joelhos para o outro lado" },
  ] },
  cat_cow: { frames: [
    { pose: quad(56, { bend: -7, neck: -35 }), caption: "arqueia (vaca)" },
    { pose: quad(56, { bend: 7, neck: 20 }), caption: "arredonda (gato)" },
  ] },

  // ── Acrescentados ──
  tibialis_raise: { frames: [
    { pose: mk({ trunk: -95, armN: [90, 90], armF: [90, 90], legN: [70, 70, 0], legF: [70, 70, 0], anchor: ["ankleN", 74, F - 2.5] }), props: [{ kind: "wall", x: 40 }], caption: "costas na parede, pés à frente" },
    { pose: mk({ trunk: -95, armN: [90, 90], armF: [90, 90], legN: [70, 70, -40], legF: [70, 70, -40], anchor: ["ankleN", 74, F - 2.5] }), props: [{ kind: "wall", x: 40 }, { kind: "arrow", from: [92, 108], to: [92, 96] }], caption: "levanta as pontas" },
  ] },
  sl_balance: { frames: [
    { pose: st(80, { armN: [20, 0], armF: [160, 180], legF: [60, 100, 0] }), caption: "apoio num pé" },
    { pose: st(80, { armN: [96, 84], armF: [84, 96], legF: [60, 100, 0], neck: -100 }), props: [{ kind: "label", at: [118, 22], text: "olhos fechados" }], caption: "progride: olhos fechados" },
  ] },
  goblet_squat: { frames: [
    { pose: st(80, { armN: [70, -100], armF: [70, -100] }), props: [{ kind: "weight", at: "handN" }], caption: "peso ao peito" },
    { pose: mk({ trunk: -70, armN: [80, -80], armF: [80, -80], legN: [15, 115, 0], legF: [15, 115, 0], anchor: ["ankleN", 80, F - 2.5] }), props: [{ kind: "weight", at: "handN" }, { kind: "arrow", from: [112, 48], to: [112, 72] }], caption: "desce com o tronco direito" },
  ] },
  reverse_lunge: { frames: [
    { pose: st(80), caption: "de pé" },
    { pose: mk({ trunk: -90, armN: [96, 84], armF: [84, 96], legN: [0, 90, 0], legF: [110, 180, 140], anchor: ["ankleN", 92, F - 2.5] }), props: [{ kind: "arrow", from: [70, 100], to: [44, 100] }], caption: "passo atrás, joelho quase no chão" },
  ] },
  hip_hike: { view: "front", frames: [
    { pose: fr(70, { trunk: -96, legN: [90, 90, 20], legF: [88, 90, 160], anchor: ["ankleN", 90, F - 12.5] }), props: [{ kind: "step", x: 76, w: 40, h: 10 }], caption: "anca livre desce" },
    { pose: fr(70, { trunk: -84, legN: [90, 90, 20], legF: [96, 96, 160], anchor: ["ankleN", 90, F - 12.5] }), props: [{ kind: "step", x: 76, w: 40, h: 10 }, { kind: "arrow", from: [58, 74], to: [58, 62] }], caption: "sobe com o glúteo da perna de apoio" },
  ] },
  box_squat_sl: { frames: [
    { pose: st(86, { armN: [-5, 0], armF: [-5, 0], legF: [40, 100, 0] }), props: [{ kind: "bench", x: 34, w: 34, h: 26 }], caption: "num pé, à frente do banco" },
    { pose: mk({ trunk: -70, armN: [-5, 0], armF: [-5, 0], legN: [0, 85, 0], legF: [-15, 15, -60], anchor: ["ankleN", 86, F - 2.5] }), props: [{ kind: "bench", x: 34, w: 34, h: 26 }, { kind: "arrow", from: [118, 52], to: [118, 72] }], caption: "senta devagar e levanta" },
  ] },
  hip_thrust: { frames: [
    { pose: mk({ trunk: -145, neck: -150, armN: [40, -140], armF: [40, -140], legN: [-10, 80, 0], legF: [-10, 80, 0], anchor: ["shoulder", 44, F - 26] }), props: [{ kind: "bench", x: 20, w: 30, h: 22 }], caption: "omoplatas no banco, anca em baixo" },
    { pose: mk({ trunk: 180, neck: 175, armN: [30, -150], armF: [30, -150], legN: [-10, 88, 0], legF: [-10, 88, 0], anchor: ["shoulder", 44, F - 26] }), props: [{ kind: "bench", x: 20, w: 30, h: 22 }, { kind: "arrow", from: [74, 104], to: [74, 88] }], caption: "anca em linha com o tronco" },
  ] },
  plank_tap: { frames: [
    { pose: plank(110), caption: "prancha alta" },
    { pose: plank(110, { armF: [200, -40] }), props: [{ kind: "arrow", from: [120, 100], to: [116, 82], curve: 4 }], caption: "toca no ombro oposto sem rodar" },
  ] },
  suitcase_carry: { view: "front", frames: [
    { pose: fr(70, { armN: [92, 90], legN: [92, 90, 20], legF: [88, 90, 160] }), props: [{ kind: "weight", at: "handN" }], caption: "peso numa mão" },
    { pose: fr(70, { armN: [92, 90], legN: [95, 88, 20], legF: [80, 100, 160] }), props: [{ kind: "weight", at: "handN" }, { kind: "label", at: [80, 14], text: "ombros nivelados" }], caption: "caminha sem inclinar" },
  ] },
  superman: { frames: [
    { pose: prone(84), caption: "de barriga para baixo" },
    { pose: prone(84, { trunk: 192, neck: 195, armN: [195, 195], armF: [195, 195], legN: [-10, -10, 70], legF: [-10, -10, 70] }), props: [{ kind: "arrow", from: [30, 96], to: [30, 86] }, { kind: "arrow", from: [134, 104], to: [134, 94] }], caption: "levanta peito, braços e pernas" },
  ] },
  wall_slide: { view: "front", frames: [
    { pose: fr(70, { armN: [10, -90], armF: [170, -90] }), caption: "braços em W na parede" },
    { pose: fr(70, { armN: [-55, -65], armF: [-125, -115] }), props: [{ kind: "arrow", from: [118, 40], to: [112, 16] }], caption: "desliza até Y" },
  ] },
  serratus_slide: { frames: [
    { pose: st(96, { armN: [-30, -90], armF: [-30, -90] }), props: [{ kind: "wall", x: 120 }], caption: "antebraços na parede" },
    { pose: st(96, { armN: [-60, -75], armF: [-60, -75] }), props: [{ kind: "wall", x: 120 }, { kind: "arrow", from: [114, 34], to: [114, 12] }], caption: "empurra e desliza para cima" },
  ] },
  band_row: { frames: [
    { pose: st(70, { armN: [-2, -2], armF: [-2, -2] }), props: [{ kind: "post", x: 140, h: 70 }, { kind: "band", from: [140, 44], to: "handN" }], caption: "braços à frente" },
    { pose: st(70, { armN: [140, -10], armF: [140, -10] }), props: [{ kind: "post", x: 140, h: 70 }, { kind: "band", from: [140, 44], to: "handN" }, { kind: "arrow", from: [84, 28], to: [64, 28] }], caption: "cotovelos atrás, omoplatas juntas" },
  ] },
};
