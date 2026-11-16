// Treino funcional / prevenção de lesões para triatletas.
// Biblioteca de exercícios por zona problemática, doses por nível e gerador de rotinas que se encaixa no plano.
import type { PlannedSession, SimpleStep } from "../types";
import { addDays, diffDays } from "../dates";

// ───────────── Zonas, níveis e material ─────────────

export type FunctionalArea =
  | "achilles" | "calves" | "plantar" | "hamstrings" | "knee" | "hip" | "adductors" | "lowerback" | "core" | "shoulders" | "neck" | "ankle";

export const AREAS: { id: FunctionalArea; label: string; hint: string }[] = [
  { id: "achilles", label: "Tendão de Aquiles", hint: "Tendinopatia, rigidez de manhã, dor ao subir" },
  { id: "calves", label: "Gémeos e sóleo", hint: "Cãibras, contraturas, sobrecarga na corrida" },
  { id: "plantar", label: "Pé / fascite plantar", hint: "Dor no calcanhar nos primeiros passos" },
  { id: "hamstrings", label: "Posterior da coxa", hint: "Contraturas, roturas anteriores, dor no ísquio" },
  { id: "knee", label: "Joelho", hint: "Tendão rotuliano, banda iliotibial, dor ao descer" },
  { id: "hip", label: "Anca e glúteos", hint: "Glúteo médio fraco, anca que cai na corrida" },
  { id: "adductors", label: "Adutores / virilha", hint: "Dor na virilha, pubalgia" },
  { id: "lowerback", label: "Lombar", hint: "Dor lombar na posição aero ou em longos" },
  { id: "core", label: "Core / estabilidade", hint: "Perda de postura no fim das provas" },
  { id: "shoulders", label: "Ombros (natação)", hint: "Ombro do nadador, dor na entrada na água" },
  { id: "neck", label: "Pescoço e dorsal", hint: "Tensão cervical na posição aero" },
  { id: "ankle", label: "Mobilidade do tornozelo", hint: "Pouca flexão do tornozelo, entorses" },
];
export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.id, a.label])) as Record<FunctionalArea, string>;

export type FunctionalLevel = "beginner" | "intermediate" | "advanced";
export const LEVEL_LABEL: Record<FunctionalLevel, string> = { beginner: "Iniciante", intermediate: "Intermédio", advanced: "Avançado" };
const LEVEL_RANK: Record<FunctionalLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export type Equipment = "band" | "step" | "dumbbell" | "slider" | "anchor";
export const EQUIPMENT: { id: Equipment; label: string }[] = [
  { id: "band", label: "Elástico" },
  { id: "step", label: "Degrau / escada" },
  { id: "dumbbell", label: "Halteres / kettlebell" },
  { id: "slider", label: "Deslizadores / toalha" },
  { id: "anchor", label: "Apoio para os pés (Nordic)" },
];

// ───────────── Exercícios ─────────────

/** heavy = excêntrico pesado (evitar na véspera de séries/longo de corrida); iso = isometria (analgésica, boa em dias de carga) */
export type ExerciseKind = "mobility" | "activation" | "strength" | "heavy" | "iso";

export interface Exercise {
  id: string;
  name: string;
  areas: FunctionalArea[];
  kind: ExerciseKind;
  level: FunctionalLevel; // nível mínimo
  equipment: Equipment[]; // vazio = peso corporal
  dose: Record<FunctionalLevel, string>;
  minutes: number; // duração estimada com pausas
  cues: string;
}

const d = (b: string, i: string, a: string) => ({ beginner: b, intermediate: i, advanced: a });

export const EXERCISES: Exercise[] = [
  // Aquiles / gémeos / pé
  { id: "heel_drop_straight", name: "Descida excêntrica de gémeos (perna esticada)", areas: ["achilles", "calves"], kind: "heavy", level: "beginner", equipment: ["step"],
    dose: d("2×10", "3×15", "3×15 com mochila"), minutes: 4, cues: "Na ponta do degrau, sobe com os dois pés e desce só com o afetado em 3 s até abaixo do nível do degrau. Dor até 3/10 é aceitável; se piorar no dia seguinte, reduz." },
  { id: "heel_drop_bent", name: "Descida excêntrica com joelho fletido (sóleo)", areas: ["achilles", "calves"], kind: "heavy", level: "beginner", equipment: ["step"],
    dose: d("2×10", "3×15", "3×15 com mochila"), minutes: 4, cues: "Igual à anterior mas com o joelho ligeiramente fletido, para carregar o sóleo." },
  { id: "calf_iso", name: "Isometria de gémeos em ponta de pés", areas: ["achilles", "calves"], kind: "iso", level: "beginner", equipment: [],
    dose: d("4×30 s", "5×45 s", "5×45 s unipodal"), minutes: 5, cues: "Sobe às pontas e mantém a meio da amplitude. Reduz a dor do tendão: útil antes de correr ou quando está irritado." },
  { id: "sl_calf_raise", name: "Elevação de gémeos unipodal", areas: ["calves", "achilles", "plantar"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×10", "3×15", "3×20 com halter"), minutes: 4, cues: "Sobe em 1 s, mantém 1 s em cima, desce em 3 s. Amplitude completa, joelho esticado." },
  { id: "soleus_wall_sit", name: "Isometria de sóleo (agachamento na parede em pontas)", areas: ["calves", "achilles", "knee"], kind: "iso", level: "intermediate", equipment: [],
    dose: d("3×20 s", "3×40 s", "4×45 s"), minutes: 4, cues: "Costas na parede, joelhos a 90° e calcanhares levantados. Mantém sem baixar os calcanhares." },
  { id: "short_foot", name: "Pé curto (arco ativo)", areas: ["plantar", "ankle"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×8×5 s", "3×10×5 s", "3×10×5 s em pé unipodal"), minutes: 3, cues: "Sem dobrar os dedos, aproxima a base do dedo grande do calcanhar e levanta o arco." },
  { id: "rathleff", name: "Elevação de gémeos com dedos em extensão (Rathleff)", areas: ["plantar", "calves"], kind: "strength", level: "intermediate", equipment: ["step"],
    dose: d("2×8", "3×12", "3×12 com mochila"), minutes: 4, cues: "Toalha enrolada sob os dedos para os manter em extensão. 3 s a subir, 2 s em cima, 3 s a descer." },
  { id: "knee_to_wall", name: "Dorsiflexão do tornozelo: joelho à parede", areas: ["ankle", "achilles", "calves"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("2×10 por lado", "2×10 por lado", "2×12 por lado"), minutes: 3, cues: "Pé a 8–12 cm da parede, leva o joelho à parede sem levantar o calcanhar." },
  // Posterior da coxa
  { id: "nordic", name: "Nordic hamstring curl", areas: ["hamstrings"], kind: "heavy", level: "advanced", equipment: ["anchor"],
    dose: d("—", "2×4 com elástico de ajuda", "3×5"), minutes: 5, cues: "Joelhos no chão e pés presos. Desce o tronco o mais devagar possível; trava com as mãos no fim. Reduz bastante o risco de rotura." },
  { id: "slider_curl", name: "Flexão de joelho com deslizadores", areas: ["hamstrings", "hip"], kind: "heavy", level: "intermediate", equipment: ["slider"],
    dose: d("—", "3×8", "3×8 unipodal"), minutes: 4, cues: "Em ponte, com os calcanhares nos deslizadores. Afasta os pés devagar (3 s) e puxa de volta sem baixar a anca." },
  { id: "sl_rdl", name: "Peso morto romeno unipodal", areas: ["hamstrings", "hip", "core"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×8 por perna", "3×10 por perna", "3×10 com halter"), minutes: 5, cues: "Anca para trás, costas neutras e perna de trás alinhada com o tronco. Joelho de apoio ligeiramente fletido." },
  { id: "bridge_walkout", name: "Ponte com passos para a frente", areas: ["hamstrings", "hip"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×4", "3×6", "3×8"), minutes: 4, cues: "Em ponte, afasta os calcanhares em 4 passos pequenos e volta, sem a anca descer." },
  { id: "iso_bridge_heel", name: "Ponte isométrica nos calcanhares", areas: ["hamstrings"], kind: "iso", level: "beginner", equipment: [],
    dose: d("3×20 s", "3×30 s", "3×30 s unipodal"), minutes: 3, cues: "Ponte com os calcanhares afastados do corpo e as pontas levantadas. Sente o posterior, não a lombar." },
  { id: "hamstring_floss", name: "Mobilização neural do posterior", areas: ["hamstrings", "lowerback"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("2×10 por lado", "2×10 por lado", "2×12 por lado"), minutes: 3, cues: "Sentado, estende o joelho enquanto levantas a cabeça e flete-o enquanto a baixas. Movimento suave, sem esticar até doer." },
  // Joelho
  { id: "spanish_squat", name: "Agachamento espanhol isométrico", areas: ["knee"], kind: "iso", level: "beginner", equipment: ["band"],
    dose: d("4×30 s", "5×45 s", "5×45 s mais fundo"), minutes: 5, cues: "Elástico atrás dos joelhos, preso a algo fixo. Senta para trás com as canelas verticais. Alivia o tendão rotuliano." },
  { id: "step_down", name: "Descida lateral do degrau", areas: ["knee", "hip"], kind: "strength", level: "beginner", equipment: ["step"],
    dose: d("2×8 por perna", "3×10 por perna", "3×12 com halter"), minutes: 5, cues: "Desce o calcanhar livre até tocar no chão em 3 s, com o joelho de apoio alinhado com o 2.º dedo (sem cair para dentro)." },
  { id: "wall_sit", name: "Agachamento isométrico na parede", areas: ["knee", "core"], kind: "iso", level: "beginner", equipment: [],
    dose: d("3×30 s", "4×45 s", "4×60 s"), minutes: 4, cues: "Joelhos a 60–90°, peso nos calcanhares." },
  // Anca / glúteos / adutores
  { id: "clamshell", name: "Concha (clamshell) com elástico", areas: ["hip", "knee"], kind: "activation", level: "beginner", equipment: ["band"],
    dose: d("2×12 por lado", "3×15 por lado", "3×20 por lado"), minutes: 4, cues: "Deitado de lado, joelhos fletidos. Abre o joelho de cima sem rodar a bacia para trás." },
  { id: "side_abduction", name: "Abdução da anca deitado de lado", areas: ["hip", "knee"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×12 por lado", "3×15 por lado", "3×15 com caneleira"), minutes: 4, cues: "Perna de cima ligeiramente para trás, calcanhar a liderar. Glúteo médio, não flexor da anca." },
  { id: "sl_bridge", name: "Ponte unipodal", areas: ["hip", "hamstrings", "lowerback"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×8 por lado", "3×10 por lado", "3×12 com pausa de 3 s"), minutes: 4, cues: "Bacia nivelada no topo; aperta o glúteo, não arqueies a lombar." },
  { id: "monster_walk", name: "Passos laterais com elástico", areas: ["hip", "knee"], kind: "activation", level: "beginner", equipment: ["band"],
    dose: d("2×10 passos por lado", "3×12 passos por lado", "3×15 com elástico nos pés"), minutes: 3, cues: "Meio agachamento, joelhos para fora, sem arrastar os pés." },
  { id: "copenhagen", name: "Prancha de Copenhaga (adutores)", areas: ["adductors", "core"], kind: "strength", level: "intermediate", equipment: [],
    dose: d("3×10 s com joelho apoiado", "3×20 s", "3×30 s com perna esticada"), minutes: 4, cues: "Prancha lateral com a perna de cima apoiada num banco. Começa com o joelho apoiado (alavanca curta)." },
  { id: "adductor_squeeze", name: "Compressão isométrica de adutores", areas: ["adductors"], kind: "iso", level: "beginner", equipment: [],
    dose: d("3×15 s", "4×20 s", "5×30 s"), minutes: 3, cues: "Deitado, joelhos fletidos com uma bola ou almofada entre eles. Aperta a 70% do máximo." },
  // Lombar / core
  { id: "dead_bug", name: "Dead bug", areas: ["core", "lowerback"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×6 por lado", "3×8 por lado", "3×10 com elástico"), minutes: 3, cues: "Lombar colada ao chão; estende braço e perna opostos devagar, a expirar." },
  { id: "bird_dog", name: "Bird dog", areas: ["core", "lowerback", "hip"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×6 por lado", "3×8 por lado (3 s)", "3×10 por lado (5 s)"), minutes: 3, cues: "A quatro apoios, estende braço e perna opostos sem rodar a bacia." },
  { id: "side_plank", name: "Prancha lateral", areas: ["core", "hip", "lowerback"], kind: "iso", level: "beginner", equipment: [],
    dose: d("2×15 s por lado", "3×30 s por lado", "3×45 s com elevação da perna"), minutes: 4, cues: "Cotovelo sob o ombro e corpo em linha. Nos iniciantes, joelhos apoiados." },
  { id: "mcgill_curl", name: "Curl-up de McGill", areas: ["lowerback", "core"], kind: "iso", level: "beginner", equipment: [],
    dose: d("2×5×8 s", "3×6×10 s", "3×6×10 s cotovelos no ar"), minutes: 3, cues: "Mãos sob a lombar, uma perna fletida. Levanta só a cabeça e os ombros, sem fletir o pescoço." },
  { id: "pallof", name: "Pallof press (anti-rotação)", areas: ["core", "lowerback"], kind: "strength", level: "intermediate", equipment: ["band"],
    dose: d("2×8 por lado", "3×10 por lado", "3×12 meio-ajoelhado"), minutes: 4, cues: "Elástico preso de lado; empurra as mãos para a frente sem deixar o tronco rodar." },
  // Ombros / pescoço / dorsal
  { id: "band_er", name: "Rotação externa do ombro com elástico", areas: ["shoulders"], kind: "activation", level: "beginner", equipment: ["band"],
    dose: d("2×12", "3×15", "3×15 a 90° de abdução"), minutes: 3, cues: "Cotovelo junto ao corpo a 90°; roda o antebraço para fora devagar." },
  { id: "ytw", name: "Y-T-W de barriga para baixo", areas: ["shoulders", "neck"], kind: "activation", level: "beginner", equipment: [],
    dose: d("1×6 de cada", "2×8 de cada", "2×10 com 0,5 kg"), minutes: 4, cues: "Polegares para cima; puxa as omoplatas para trás e para baixo antes de levantar os braços." },
  { id: "scap_pushup", name: "Flexões escapulares", areas: ["shoulders"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×10 (joelhos)", "3×12", "3×15"), minutes: 3, cues: "Em prancha com os braços esticados, aproxima e afasta as omoplatas sem dobrar os cotovelos." },
  { id: "pull_apart", name: "Afastamento de elástico (pull-apart)", areas: ["shoulders", "neck"], kind: "activation", level: "beginner", equipment: ["band"],
    dose: d("2×12", "3×15", "3×20"), minutes: 3, cues: "Braços esticados à altura do peito; abre o elástico até ao peito com as omoplatas." },
  { id: "chin_tuck", name: "Retração cervical (chin tuck)", areas: ["neck"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×8×5 s", "3×10×5 s", "3×10×5 s deitado"), minutes: 2, cues: "Puxa o queixo para trás (queixo duplo) sem inclinar a cabeça." },
  { id: "open_book", name: "Rotação torácica (livro aberto)", areas: ["neck", "shoulders", "lowerback"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("1×8 por lado", "2×8 por lado", "2×10 por lado"), minutes: 3, cues: "Deitado de lado com os joelhos fletidos; abre o braço de cima seguindo-o com o olhar." },
  // Mobilidade geral
  { id: "hip_flexor", name: "Alongamento dos flexores da anca", areas: ["hip", "lowerback"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("2×30 s por lado", "2×45 s por lado", "2×60 s por lado"), minutes: 3, cues: "Meio-ajoelhado, encaixa a bacia (retroversão) e avança ligeiramente. Essencial para quem passa horas na posição aero." },
  { id: "ninety_ninety", name: "Mobilidade da anca 90/90", areas: ["hip", "adductors"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("1×6 por lado", "2×6 por lado", "2×8 por lado sem mãos"), minutes: 3, cues: "Sentado com as duas pernas a 90°; roda os joelhos de um lado para o outro com o tronco direito." },
  { id: "cat_cow", name: "Gato-vaca", areas: ["lowerback", "neck"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("1×10", "1×10", "1×12"), minutes: 2, cues: "A quatro apoios, alterna arquear e arredondar a coluna, a acompanhar a respiração." },
  // ── acrescentados: força geral, estabilidade e ombros ──
  { id: "tibialis_raise", name: "Elevação do tibial anterior (costas na parede)", areas: ["ankle", "knee", "calves"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×12", "3×15", "3×20 mais longe da parede"), minutes: 3, cues: "Costas na parede e calcanhares a 30 cm. Levanta as pontas dos pés o mais possível e desce devagar. Ajuda a prevenir dores na canela." },
  { id: "sl_balance", name: "Equilíbrio unipodal", areas: ["ankle", "plantar", "knee"], kind: "activation", level: "beginner", equipment: [],
    dose: d("3×30 s por pé", "3×45 s de olhos fechados", "3×45 s em superfície instável"), minutes: 4, cues: "Apoio num pé com o joelho ligeiramente fletido e a bacia nivelada. Os dedos agarram o chão sem encolher." },
  { id: "goblet_squat", name: "Agachamento goblet", areas: ["knee", "hip", "core"], kind: "strength", level: "beginner", equipment: ["dumbbell"],
    dose: d("2×10", "3×12", "3×10 com pausa de 2 s em baixo"), minutes: 5, cues: "Peso junto ao peito e cotovelos para baixo. Desce entre as pernas com o tronco direito e os joelhos a seguir os pés." },
  { id: "reverse_lunge", name: "Afundo para trás", areas: ["knee", "hip", "hamstrings"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×8 por perna", "3×10 por perna", "3×10 com halteres"), minutes: 5, cues: "Dá um passo atrás e desce até o joelho de trás quase tocar o chão. Canela da frente quase vertical; empurra pelo calcanhar da frente." },
  { id: "hip_hike", name: "Elevação pélvica no degrau (hip hike)", areas: ["hip", "knee"], kind: "activation", level: "beginner", equipment: ["step"],
    dose: d("2×10 por lado", "3×12 por lado", "3×15 com pausa de 2 s"), minutes: 4, cues: "De lado num degrau, apoiado numa perna esticada. Deixa a anca livre descer e sobe-a acima do nível usando o glúteo médio da perna de apoio." },
  { id: "box_squat_sl", name: "Agachamento unipodal até ao banco", areas: ["knee", "hip"], kind: "strength", level: "intermediate", equipment: [],
    dose: d("—", "3×6 por perna", "3×8 por perna em banco baixo"), minutes: 5, cues: "Numa perna, senta devagar até tocar no banco e levanta sem impulso. Joelho alinhado com o pé, sem cair para dentro." },
  { id: "hip_thrust", name: "Hip thrust com ombros no banco", areas: ["hip", "hamstrings", "lowerback"], kind: "strength", level: "beginner", equipment: [],
    dose: d("2×10", "3×12", "3×10 com peso na anca"), minutes: 4, cues: "Omoplatas apoiadas no banco e pés no chão. Sobe a anca até o tronco ficar alinhado com as coxas, com o queixo recolhido." },
  { id: "plank_tap", name: "Prancha com toque no ombro", areas: ["core", "shoulders"], kind: "iso", level: "beginner", equipment: [],
    dose: d("2×6 por lado (joelhos)", "3×10 por lado", "3×12 por lado com pés juntos"), minutes: 3, cues: "Prancha alta com os pés afastados. Toca no ombro oposto sem a bacia rodar nem balançar." },
  { id: "suitcase_carry", name: "Caminhada com peso num lado (suitcase carry)", areas: ["core", "lowerback", "hip"], kind: "strength", level: "beginner", equipment: ["dumbbell"],
    dose: d("3×20 m por lado", "3×30 m por lado", "4×40 m por lado"), minutes: 4, cues: "Peso numa mão e caminhada direita, sem inclinar o tronco para nenhum dos lados. Ombros nivelados." },
  { id: "superman", name: "Extensão lombar em prono (superman)", areas: ["lowerback", "neck", "shoulders"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×8 (3 s)", "3×10 (3 s)", "3×12 (5 s)"), minutes: 3, cues: "De barriga para baixo, levanta peito, braços e pernas poucos centímetros, com o olhar para o chão." },
  { id: "wall_slide", name: "Deslizamento na parede (wall slide)", areas: ["shoulders", "neck"], kind: "mobility", level: "beginner", equipment: [],
    dose: d("2×8", "2×10", "3×10 com elástico"), minutes: 3, cues: "Costas, cabeça e antebraços na parede. Desliza os braços de W para Y sem perder o contacto nem arquear a lombar." },
  { id: "serratus_slide", name: "Deslizamento de antebraços na parede (serrátil)", areas: ["shoulders"], kind: "activation", level: "beginner", equipment: [],
    dose: d("2×8", "3×10", "3×10 com elástico nos pulsos"), minutes: 3, cues: "De frente para a parede, com os antebraços apoiados. Empurra a parede (omoplatas afastadas) enquanto deslizas os braços para cima." },
  { id: "band_row", name: "Remada com elástico", areas: ["shoulders", "neck", "lowerback"], kind: "strength", level: "beginner", equipment: ["band"],
    dose: d("2×12", "3×15", "3×15 unilateral"), minutes: 3, cues: "Elástico preso à frente à altura do peito. Puxa os cotovelos para trás junto ao corpo e aproxima as omoplatas, sem encolher os ombros." },
];

export const EXERCISE = Object.fromEntries(EXERCISES.map((e) => [e.id, e])) as Record<string, Exercise>;

// ───────────── Rotinas ─────────────

export type RoutineMode = "full" | "short" | "mobility";

/** número máximo de zonas trabalhadas numa rotina completa */
export const MAX_AREAS = 4;
export const MODE_LABEL: Record<RoutineMode, string> = { full: "Rotina completa", short: "Rotina curta", mobility: "Só mobilidade" };

export interface FunctionalProfile { areas: FunctionalArea[]; level: FunctionalLevel; equipment: Equipment[] }

export interface RoutineItem { exercise: Exercise; dose: string; area: FunctionalArea | "warmup" | "core" }
export interface Routine { date: string; mode: RoutineMode; items: RoutineItem[]; minutes: number; areas: FunctionalArea[]; avoidHeavy: boolean; note?: string }

const available = (e: Exercise, p: FunctionalProfile) => LEVEL_RANK[e.level] <= LEVEL_RANK[p.level] && e.equipment.every((q) => p.equipment.includes(q));
const dayNum = (date: string) => Math.floor(Date.parse(date + "T00:00:00Z") / 864e5);

/** Escolhe exercícios rodando pela data, para variar entre sessões (A/B/C…). */
function pick(cands: Exercise[], date: string, salt: number, used: Set<string>): Exercise | null {
  const list = cands.filter((e) => !used.has(e.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  const e = list[(Math.floor(dayNum(date) / 2) + salt) % list.length];
  used.add(e.id);
  return e;
}

export function buildRoutine(p: FunctionalProfile, date: string, mode: RoutineMode, opts: { avoidHeavy?: boolean } = {}): Routine {
  /** até 4 zonas na rotina completa (2 exercícios nas duas primeiras, 1 nas restantes); 2 na curta e na mobilidade */
  const areas = p.areas.slice(0, mode === "full" ? MAX_AREAS : 2);
  const avoidHeavy = !!opts.avoidHeavy;
  const used = new Set<string>();
  const items: RoutineItem[] = [];
  const ok = (e: Exercise) => available(e, p) && !(avoidHeavy && e.kind === "heavy");
  const add = (e: Exercise | null, area: RoutineItem["area"]) => { if (e) items.push({ exercise: e, dose: e.dose[p.level] === "—" ? e.dose.intermediate : e.dose[p.level], area }); };

  if (mode === "mobility") {
    // mobilidade das zonas escolhidas (ou geral) + 1 isometria suave
    const pool = EXERCISES.filter((e) => ok(e) && e.kind === "mobility");
    for (const [i, a] of (areas.length ? areas : (["hip", "ankle"] as FunctionalArea[])).entries()) add(pick(pool.filter((e) => e.areas.includes(a)), date, i, used) ?? pick(pool, date, i, used), a);
    add(pick(pool, date, 5, used), "warmup");
    const iso = EXERCISES.filter((e) => ok(e) && e.kind === "iso" && areas.some((a) => e.areas.includes(a)));
    add(pick(iso, date, 1, used), areas[0] ?? "core");
  } else {
    // aquecimento: 1–2 de mobilidade ligada às zonas
    const mob = EXERCISES.filter((e) => ok(e) && e.kind === "mobility");
    const mobForAreas = mob.filter((e) => areas.some((a) => e.areas.includes(a)));
    add(pick(mobForAreas.length ? mobForAreas : mob, date, 0, used), "warmup");
    if (mode === "full") add(pick(mob, date, 3, used), "warmup");
    // por zona: na completa, 1 de força (ou excêntrico) + 1 de ativação/isometria; na curta, só ativação/isometria
    areas.forEach((a, i) => {
      const forArea = EXERCISES.filter((e) => ok(e) && e.areas.includes(a) && e.kind !== "mobility");
      if (mode === "full") {
        const main = forArea.filter((e) => e.kind === "heavy" || e.kind === "strength");
        add(pick(main.length ? main : forArea, date, i, used), a);
        if (i < 2) add(pick(forArea.filter((e) => e.kind === "activation" || e.kind === "iso"), date, i + 1, used) ?? pick(forArea, date, i + 2, used), a);
      } else {
        const light = forArea.filter((e) => e.kind === "activation" || e.kind === "iso");
        add(pick(light.length ? light : forArea, date, i, used), a);
      }
    });
    // core no fim da completa (se ainda não houver)
    if (mode === "full" && !areas.includes("core")) add(pick(EXERCISES.filter((e) => ok(e) && e.areas.includes("core") && e.kind !== "mobility"), date, 7, used), "core");
  }
  const minutes = items.reduce((s, x) => s + x.exercise.minutes, 0);
  const note = avoidHeavy && areas.some((a) => ["achilles", "calves", "hamstrings"].includes(a))
    ? "Amanhã há sessão dura de corrida: sem excêntricos pesados hoje, só isometria e ativação."
    : undefined;
  return { date, mode, items, minutes, areas, avoidHeavy, note };
}

// ───────────── Encaixe na semana ─────────────

export type DayKind = "rest" | "easy" | "hard" | "race";

const HARD_TYPES = new Set(["intervals", "tempo", "long", "race"]);

export function classifyDay(sessions: PlannedSession[], isRace: boolean): DayKind {
  if (isRace) return "race";
  const train = sessions.filter((s) => s.type !== "functional");
  if (!train.length) return "rest";
  const total = train.reduce((s, x) => s + x.durationMin, 0);
  if (train.some((s) => HARD_TYPES.has(s.type)) || total > 90) return "hard";
  return "easy";
}

/** véspera de sessão dura de corrida → evitar excêntricos pesados de Aquiles/gémeos/posteriores */
function nextDayHardRun(planned: PlannedSession[], date: string) {
  const next = addDays(date, 1);
  return planned.some((s) => s.date === next && (s.sport === "run" || s.sport === "brick") && HARD_TYPES.has(s.type));
}

export interface DaySuggestion { date: string; kind: DayKind; mode: RoutineMode | null; reason: string; avoidHeavy: boolean }

/**
 * Sugestões para os 7 dias a partir de `weekStart`: rotina completa nos dias de descanso (até 3),
 * curta nos dias leves se houver menos de 2 dias de descanso; nada em dias duros, de prova ou na véspera de prova.
 */
export function weekSuggestions(planned: PlannedSession[], raceDates: string[], weekStart: string, target = 3): DaySuggestion[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const info = days.map((date) => {
    const kind = classifyDay(planned.filter((s) => s.date === date), raceDates.includes(date));
    const preRace = raceDates.includes(addDays(date, 1));
    return { date, kind, preRace, avoidHeavy: nextDayHardRun(planned, date) };
  });
  const out: DaySuggestion[] = info.map((x) => ({ date: x.date, kind: x.kind, mode: null, avoidHeavy: x.avoidHeavy, reason: "" }));
  let count = 0;
  // 1) dias de descanso, espaçados (não dois seguidos)
  for (const [i, x] of info.entries()) {
    if (count >= target) break;
    if (x.kind !== "rest" || x.preRace) continue;
    if (i > 0 && out[i - 1].mode === "full") continue;
    out[i].mode = "full"; out[i].reason = "Dia de descanso: o melhor dia para força e prevenção."; count++;
  }
  // 2) completar com dias leves (rotina curta)
  for (const [i, x] of info.entries()) {
    if (count >= Math.min(target, 3)) break;
    if (out[i].mode || x.kind !== "easy" || x.preRace) continue;
    if ((i > 0 && out[i - 1].mode) || (i < 6 && out[i + 1]?.mode)) continue;
    out[i].mode = "short"; out[i].reason = "Dia leve: rotina curta depois do treino."; count++;
  }
  for (const [i, x] of info.entries()) {
    if (out[i].mode) continue;
    out[i].reason = x.kind === "race" ? "Dia de prova." : x.preRace ? "Véspera de prova: só descanso." : x.kind === "hard" ? "Dia de treino duro: foque-se na sessão e recupere." : x.kind === "rest" ? "Descanso completo." : "Treino leve.";
  }
  return out;
}

/** Converte a rotina numa sessão planeada (Força · Funcional), exportável para FIT. */
export function routineToSession(r: Routine): PlannedSession {
  const steps: SimpleStep[] = r.items.map((it) => ({ kind: "step", intensity: it.exercise.kind === "mobility" ? "warmup" : "active", durationS: it.exercise.minutes * 60, target: { type: "open" }, name: it.exercise.name.slice(0, 15) }));
  return {
    id: "", date: r.date, sport: "strength", type: "functional", durationMin: r.minutes, tss: Math.round((r.minutes / 60) * 40),
    title: `Funcional · ${r.areas.map((a) => AREA_LABEL[a].split(" ")[0]).join(", ") || "geral"}`,
    description: r.items.map((it) => `${it.exercise.name}: ${it.dose}`).join(" · "),
    steps,
  };
}

/** Sessões funcionais feitas nos últimos `days` dias, a partir do registo. */
export function recentCount(log: { date: string }[], today: string, days = 7) {
  return log.filter((l) => diffDays(l.date, today) >= 0 && diffDays(l.date, today) < days).length;
}
