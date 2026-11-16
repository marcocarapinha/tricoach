import React, { useMemo } from "react";
import { Flag } from "lucide-react";
import { useLoaded } from "@/lib/data/DataProvider";
import { ComponentBars, DeltaBadge, Empty, ReadinessGauge, SuggestionCard, LEVEL_COLOR } from "@/components/common";
import { CompareTable, StatsBars, CompareTableWidget, CumulativeChart, HealthTrend, Heatmap, LoadChart, PeriodBars, RecentActivities, WeeklyLoad, ZonesBar, HEALTH_METRICS } from "@/components/viz";
import { METRIC, METRICS, DIMS, PERIOD_LABEL, runStats, delta, isGood, rangeLabel, cumulative, type StatsQuery } from "@/lib/engine/stats";
import { SPORT_LABEL } from "@/lib/types";
import { addDays, diffDays, fmtDatePt, startOfWeek, fmtDuration } from "@/lib/dates";
import { TodayPlanned } from "@/components/TodayPlan";
import { FunctionalCard } from "@/components/Functional";
import { matchWeek, weekCompliance } from "@/lib/engine/plan";
import { phaseOn } from "@/lib/engine/periodization";
import { PHASE_LABEL } from "@/lib/types";
import { PHASE_COLOR } from "@/components/common";

export type FieldDef =
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "multi"; options: { value: string; label: string }[]; max?: number }
  | { key: string; label: string; kind: "years" }
  | { key: string; label: string; kind: "number"; min: number; max: number }
  | { key: string; label: string; kind: "text" };

export interface WidgetDef {
  type: string;
  label: string;
  description: string;
  category: "Hoje" | "Recuperação" | "Carga" | "Volume" | "Comparação" | "Atividades" | "Texto";
  size: { w: number; h: number; minW?: number; minH?: number };
  defaults: Record<string, any>;
  fields: FieldDef[];
  title?: (c: Record<string, any>) => string;
  /** não aparece no catálogo (criado a partir de outro ecrã) */
  hidden?: boolean;
  Component: React.FC<{ config: Record<string, any> }>;
}

const sportOpts = [{ value: "all", label: "Todas" }, ...(["swim", "bike", "run", "brick", "strength"] as const).map((s) => ({ value: s, label: SPORT_LABEL[s] }))];
const actMetricOpts = METRICS.filter((m) => m.source === "activity").map((m) => ({ value: m.key, label: m.label }));
const sumMetricOpts = METRICS.filter((m) => m.source === "activity" && m.defaultAgg === "sum").map((m) => ({ value: m.key, label: m.label }));
const allMetricOpts = METRICS.map((m) => ({ value: m.key, label: m.label }));
const periodOpts = (["ytd", "year", "season", "quarter", "month", "last28", "last90"] as const).map((k) => ({ value: k, label: PERIOD_LABEL[k] }));
const healthOpts = Object.entries(HEALTH_METRICS).map(([k, v]) => ({ value: k, label: v.label }));
const dimOpts = DIMS.map((d) => ({ value: d.key, label: d.label }));
const timeDimOpts = DIMS.filter((d) => d.time).map((d) => ({ value: d.key, label: d.label }));

// ───────────── Componentes de widget ─────────────

function ReadinessW() {
  const { derived } = useLoaded();
  return (
    <div className="flex h-full items-center gap-4">
      <ReadinessGauge r={derived.readiness} size={132} />
      <div className="min-w-0 flex-1"><ComponentBars r={derived.readiness} /></div>
    </div>
  );
}

function RecommendationW() {
  const { derived } = useLoaded();
  const r = derived.recommendation;
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[derived.readiness.level] }} />
        <span className="text-lg font-semibold">{r.title}</span>
      </div>
      <p className="text-sm">{r.detail}</p>
      <div className="flex gap-4 text-xs text-muted-foreground">
        {r.durationMin[1] > 0 && <span>{r.durationMin[0]}–{r.durationMin[1]} min</span>}
        <span>Zonas: {r.zones}</span>
      </div>
      <div className="mt-auto space-y-1 border-t pt-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Porquê</div>
        {r.reasons.map((x) => <div key={x} className="text-xs">• {x}</div>)}
      </div>
    </div>
  );
}

function AlertsW() {
  const { derived, statuses, setStatus } = useLoaded();
  const s = derived.suggestions;
  if (!s.length) return <Empty>Sem alertas hoje.</Empty>;
  return <div className="space-y-2">{s.map((x) => <SuggestionCard key={x.id} s={x} status={statuses[x.id]} onStatus={(st) => setStatus(x, st)} compact />)}</div>;
}

function NextRaceW() {
  const { core, derived } = useLoaded();
  const r = core.nextRace;
  if (!r) return <Empty>Defina a próxima prova em Definições.</Empty>;
  const d = diffDays(derived.today, r.date);
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Flag className="h-3.5 w-3.5" />{r.name} · prioridade {r.priority}</div>
      <div className="num text-4xl font-semibold">{d}<span className="ml-1 text-base font-normal text-muted-foreground">dias</span></div>
      <div className="text-xs text-muted-foreground">{fmtDatePt(r.date)} · {Math.floor(d / 7)} semanas</div>
    </div>
  );
}

function KpiW({ config }: { config: Record<string, any> }) {
  const { core, derived } = useLoaded();
  const m = METRIC[config.metric] ?? METRIC.distance;
  const off = Number(config.compareOffset ?? 1);
  const res = useMemo(() => runStats(core.activities, core.wellness, { period: { kind: config.period ?? "ytd" }, compare: off ? [off] : [], groupBy: [], metrics: [m.key], sports: config.sport && config.sport !== "all" ? [config.sport] : [] }, core.profile, derived.today), [core, JSON.stringify(config)]);
  const cur = res.total[m.key]?.[0];
  const prev = off ? res.total[m.key]?.[off] : null;
  const d = delta(cur, prev);
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="num text-3xl font-semibold tracking-tight">{cur == null ? "–" : m.format(cur)}<span className="ml-1 text-sm font-normal text-muted-foreground">{m.unit === "h" ? "" : m.unit}</span></div>
      {off > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {d ? <DeltaBadge pct={d.pct} good={isGood(m, d.abs)} /> : null}
          <span>vs {res.empty[off] ? "sem dados" : `${prev == null ? "–" : m.format(prev)} em ${rangeLabel(res.ranges[off])}`}</span>
        </div>
      )}
    </div>
  );
}

function AnalysisW({ config }: { config: Record<string, any> }) {
  const { core, derived } = useLoaded();
  const q = config.query as StatsQuery;
  const res = useMemo(() => runStats(core.activities, core.wellness, q, core.profile, derived.today), [core, JSON.stringify(q)]);
  if (config.chart === "cumulative") return <CumulativeChart metric={q.metrics[0]} sport={q.sports?.[0] ?? "all"} compare={q.compare} period={q.period.kind} />;
  if (config.chart === "bars") return <StatsBars res={res} metric={q.metrics[0]} />;
  return <CompareTable res={res} metrics={q.metrics} dense />;
}

function WeekComplianceW() {
  const { core, derived } = useLoaded();
  const ws = startOfWeek(derived.today), we = addDays(ws, 6);
  const { matches, unplanned } = matchWeek(core.planned.filter((x) => x.date >= ws && x.date <= we), core.activities.filter((a) => a.date >= ws && a.date <= we), derived.today);
  const c = weekCompliance(matches, unplanned, core.profile);
  const ph = phaseOn(derived.season, derived.today);
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {ph && <div className="text-xs"><span className="font-medium" style={{ color: PHASE_COLOR[ph.phase] }}>{PHASE_LABEL[ph.phase]}</span><span className="text-muted-foreground"> · semana de {fmtDatePt(ws)}</span></div>}
      <div className="grid grid-cols-3 gap-2">
        <div><div className="text-[11px] text-muted-foreground">Sessões</div><div className="num text-2xl font-semibold">{c.sessionsDue ? `${c.sessionsDone}/${c.sessionsDue}` : "–"}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Volume</div><div className={"num text-2xl font-semibold " + (c.volumePct == null ? "" : c.volumePct >= 85 ? "text-good" : c.volumePct >= 65 ? "text-warn" : "text-bad")}>{c.volumePct == null ? "–" : `${c.volumePct}%`}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Feito / plano</div><div className="num text-sm font-medium">{fmtDuration(c.actualMin * 60)}<span className="text-muted-foreground"> / {fmtDuration(c.plannedMin * 60)}</span></div></div>
      </div>
    </div>
  );
}

function NoteW({ config }: { config: Record<string, any> }) {
  return <div className="whitespace-pre-wrap text-sm">{config.text || <span className="text-muted-foreground">Escreva uma nota nas definições do widget.</span>}</div>;
}

// ───────────── Registo ─────────────

export const WIDGETS: WidgetDef[] = [
  { type: "readiness", label: "Prontidão do dia", description: "Índice 0–100 e componentes", category: "Hoje", size: { w: 4, h: 6, minW: 3, minH: 4 }, defaults: {}, fields: [], Component: ReadinessW },
  { type: "recommendation", label: "Treino recomendado", description: "O que fazer hoje e porquê", category: "Hoje", size: { w: 5, h: 6, minW: 3, minH: 4 }, defaults: {}, fields: [], Component: RecommendationW },
  { type: "alerts", label: "Alertas e sugestões", description: "Regras ativas hoje", category: "Hoje", size: { w: 6, h: 6, minW: 3, minH: 3 }, defaults: {}, fields: [], Component: AlertsW },
  { type: "plannedToday", label: "Treino de hoje", description: "Sessão planeada, com exportação FIT", category: "Hoje", size: { w: 4, h: 5, minW: 3, minH: 3 }, defaults: {}, fields: [], Component: () => <TodayPlanned compact /> },
  { type: "functional", label: "Treino funcional", description: "Rotina de força e mobilidade sugerida para hoje", category: "Hoje", size: { w: 6, h: 9, minW: 4, minH: 6 }, defaults: {}, fields: [], title: () => "Treino funcional",
    Component: () => <FunctionalCard className="border-0 bg-transparent shadow-none [&>div]:px-0" /> },
  { type: "weekCompliance", label: "Semana: planeado vs realizado", description: "Cumprimento do plano desta semana", category: "Carga", size: { w: 4, h: 4, minW: 3, minH: 3 }, defaults: {}, fields: [], Component: WeekComplianceW },
  { type: "nextRace", label: "Próxima prova", description: "Contagem decrescente", category: "Hoje", size: { w: 3, h: 3, minW: 2, minH: 3 }, defaults: {}, fields: [], Component: NextRaceW },
  {
    type: "healthTrend", label: "Tendência de saúde", description: "HRV, FC repouso, sono, stress ou Body Battery com banda pessoal", category: "Recuperação",
    size: { w: 6, h: 6, minW: 3, minH: 4 }, defaults: { metric: "hrv", days: 60 },
    fields: [{ key: "metric", label: "Métrica", kind: "select", options: healthOpts }, { key: "days", label: "Dias", kind: "number", min: 14, max: 365 }],
    title: (c) => `${HEALTH_METRICS[c.metric]?.label ?? "Saúde"} · ${c.days} dias`,
    Component: ({ config }) => <HealthTrend metric={config.metric} days={Number(config.days)} />,
  },
  {
    type: "loadChart", label: "Forma, fadiga e frescura", description: "CTL / ATL / TSB", category: "Carga", size: { w: 8, h: 7, minW: 4, minH: 5 }, defaults: { days: 120 },
    fields: [{ key: "days", label: "Dias", kind: "number", min: 30, max: 1460 }], title: (c) => `Forma, fadiga e frescura · ${c.days} dias`,
    Component: ({ config }) => <LoadChart days={Number(config.days)} />,
  },
  {
    type: "weeklyLoad", label: "Carga semanal por modalidade", description: "TSS por semana, empilhado", category: "Carga", size: { w: 6, h: 7, minW: 4, minH: 5 }, defaults: { weeks: 12 },
    fields: [{ key: "weeks", label: "Semanas", kind: "number", min: 4, max: 104 }], title: (c) => `Carga semanal · ${c.weeks} semanas`,
    Component: ({ config }) => <WeeklyLoad weeks={Number(config.weeks)} />,
  },
  {
    type: "zones", label: "Tempo em zonas", description: "Distribuição de intensidade", category: "Carga", size: { w: 4, h: 5, minW: 3, minH: 4 }, defaults: { days: 28 },
    fields: [{ key: "days", label: "Dias", kind: "number", min: 7, max: 365 }], title: (c) => `Tempo em zonas · ${c.days} dias`,
    Component: ({ config }) => <ZonesBar days={Number(config.days)} />,
  },
  {
    type: "kpi", label: "KPI com comparação", description: "Um número e a variação vs ano anterior", category: "Volume", size: { w: 3, h: 3, minW: 2, minH: 3 },
    defaults: { metric: "distance", sport: "all", period: "ytd", compareOffset: 1 },
    fields: [
      { key: "metric", label: "Métrica", kind: "select", options: allMetricOpts },
      { key: "sport", label: "Modalidade", kind: "select", options: sportOpts },
      { key: "period", label: "Período", kind: "select", options: periodOpts },
      { key: "compareOffset", label: "Comparar com", kind: "select", options: [{ value: "0", label: "Sem comparação" }, { value: "1", label: "N-1" }, { value: "2", label: "N-2" }, { value: "3", label: "N-3" }] },
    ],
    title: (c) => `${METRIC[c.metric]?.label ?? ""} · ${c.sport === "all" ? "todas" : SPORT_LABEL[c.sport as keyof typeof SPORT_LABEL]?.toLowerCase()} · ${PERIOD_LABEL[c.period as keyof typeof PERIOD_LABEL] ?? ""}`,
    Component: KpiW,
  },
  {
    type: "cumulative", label: "Acumulado vs anos anteriores", description: "Linhas de acumulado, uma por ano", category: "Comparação", size: { w: 7, h: 8, minW: 4, minH: 5 },
    defaults: { metric: "duration", sport: "all", compare: [1, 2, 3], period: "ytd" },
    fields: [
      { key: "metric", label: "Métrica", kind: "select", options: sumMetricOpts },
      { key: "sport", label: "Modalidade", kind: "select", options: sportOpts },
      { key: "period", label: "Período", kind: "select", options: periodOpts.filter((p) => p.value !== "year") },
      { key: "compare", label: "Comparar com", kind: "years" },
    ],
    title: (c) => `${METRIC[c.metric]?.label} acumulado · ${c.sport === "all" ? "todas" : SPORT_LABEL[c.sport as keyof typeof SPORT_LABEL]?.toLowerCase()}`,
    Component: ({ config }) => <CumulativeChart metric={config.metric} sport={config.sport} compare={config.compare} period={config.period} />,
  },
  {
    type: "periodBars", label: "Barras por período e ano", description: "Ex.: volume por mês, ano atual vs anteriores", category: "Comparação", size: { w: 7, h: 7, minW: 4, minH: 5 },
    defaults: { metric: "duration", sport: "all", compare: [1, 2], groupBy: "month", period: "year" },
    fields: [
      { key: "metric", label: "Métrica", kind: "select", options: actMetricOpts },
      { key: "sport", label: "Modalidade", kind: "select", options: sportOpts },
      { key: "groupBy", label: "Agrupar por", kind: "select", options: timeDimOpts },
      { key: "period", label: "Período", kind: "select", options: periodOpts },
      { key: "compare", label: "Comparar com", kind: "years" },
    ],
    title: (c) => `${METRIC[c.metric]?.label} por ${DIMS.find((d) => d.key === c.groupBy)?.label.toLowerCase()}`,
    Component: ({ config }) => <PeriodBars metric={config.metric} sport={config.sport} compare={config.compare} groupBy={config.groupBy} period={config.period} />,
  },
  {
    type: "compareTable", label: "Tabela comparativa", description: "Métricas por agrupamento com N-1/N-2/N-3", category: "Comparação", size: { w: 6, h: 7, minW: 4, minH: 4 },
    defaults: { metrics: ["distance", "duration"], groupBy: ["sport"], period: "ytd", compare: [1, 2, 3] },
    fields: [
      { key: "metrics", label: "Métricas", kind: "multi", options: allMetricOpts, max: 3 },
      { key: "groupBy", label: "Agrupar por (até 2)", kind: "multi", options: dimOpts, max: 2 },
      { key: "period", label: "Período", kind: "select", options: periodOpts },
      { key: "compare", label: "Comparar com", kind: "years" },
    ],
    title: (c) => `Comparação · ${PERIOD_LABEL[c.period as keyof typeof PERIOD_LABEL]}`,
    Component: ({ config }) => <CompareTableWidget {...(config as any)} />,
  },
  {
    type: "heatmap", label: "Calendário de carga", description: "TSS por dia", category: "Volume", size: { w: 12, h: 5, minW: 6, minH: 4 }, defaults: { weeks: 26 },
    fields: [{ key: "weeks", label: "Semanas", kind: "number", min: 8, max: 53 }], title: (c) => `Calendário de carga · ${c.weeks} semanas`,
    Component: ({ config }) => <Heatmap weeks={Number(config.weeks)} />,
  },
  {
    type: "recentActivities", label: "Atividades recentes", description: "Últimos treinos", category: "Atividades", size: { w: 6, h: 6, minW: 3, minH: 4 }, defaults: { limit: 6 },
    fields: [{ key: "limit", label: "N.º atividades", kind: "number", min: 3, max: 20 }],
    Component: ({ config }) => <RecentActivities limit={Number(config.limit)} />,
  },
  {
    type: "note", label: "Nota / objetivo", description: "Texto livre", category: "Texto", size: { w: 4, h: 4, minW: 2, minH: 2 }, defaults: { text: "" },
    fields: [{ key: "text", label: "Texto", kind: "text" }], title: () => "Nota", Component: NoteW,
  },
  {
    type: "analysis", label: "Análise guardada", description: "Fixada a partir de Estatísticas", category: "Comparação", size: { w: 6, h: 7, minW: 4, minH: 4 },
    defaults: {}, fields: [], hidden: true, title: (c) => c.name ?? "Análise", Component: AnalysisW,
  },
];

export const WIDGET = Object.fromEntries(WIDGETS.map((w) => [w.type, w])) as Record<string, WidgetDef>;
