import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Download, LineChart as LineIcon, Pin, Save, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { AGG_LABEL, DIMS, METRIC, METRICS, PERIOD_LABEL, rangeLabel, runStats, type Agg, type PeriodKind, type StatsQuery, type StatsResult, type StatsRow } from "@/lib/engine/stats";
import { CompareTable, CumulativeChart, StatsBars } from "@/components/viz";
import { YearsPicker } from "@/components/widgets/WidgetConfigDialog";
import { PageHeader, OFFSET_COLOR } from "@/components/common";
import { fmtDatePt } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SPORT_LABEL } from "@/lib/types";
import type { SavedAnalysis } from "@/lib/data/store";

type ChartKind = "table" | "bars" | "cumulative";

const DEFAULT_Q: StatsQuery = { period: { kind: "ytd" }, compare: [1, 2, 3], groupBy: ["sport", "month"], metrics: ["distance", "duration", "tss"], agg: {}, sports: [] };

export default function StatsPage() {
  const { core, derived, store } = useLoaded();
  const qc = useQueryClient();
  const [q, setQ] = useState<StatsQuery>(DEFAULT_Q);
  const [chart, setChart] = useState<ChartKind>("table");
  const [chartMetric, setChartMetric] = useState("distance");
  const [name, setName] = useState("");
  const analyses = useQuery({ queryKey: ["analyses", store.mode], queryFn: () => store.listAnalyses() });

  const res = useMemo(() => runStats(core.activities, core.wellness, q, core.profile, derived.today), [core, q, derived.today]);
  const metricForChart = q.metrics.includes(chartMetric) ? chartMetric : q.metrics[0];
  const barRes = useMemo(() => (q.groupBy.length ? runStats(core.activities, core.wellness, { ...q, groupBy: [q.groupBy[0]] }, core.profile, derived.today) : res), [core, q, res]);

  const set = (patch: Partial<StatsQuery>) => setQ((o) => ({ ...o, ...patch }));
  const toggle = (arr: string[], v: string, max: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.length >= max ? arr : [...arr, v]);

  const save = async (pin: boolean) => {
    const n = name.trim() || autoName(q);
    const a = await store.saveAnalysis({ id: "", name: n, query: q, chart } as SavedAnalysis);
    qc.invalidateQueries({ queryKey: ["analyses"] });
    if (pin) {
      const ds = await store.listDashboards();
      const d = ds.find((x) => x.isDefault) ?? ds[0];
      const i = `analysis-${Math.random().toString(36).slice(2, 8)}`;
      const maxY = d.layouts.lg.reduce((m, l) => Math.max(m, l.y + l.h), 0);
      await store.saveDashboard({ ...d, widgets: [...d.widgets, { i, type: "analysis", config: { name: n, query: q, chart, title: n } }], layouts: { ...d.layouts, lg: [...d.layouts.lg, { i, x: 0, y: maxY, w: chart === "table" ? 6 : 7, h: 7 }] } });
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success(`“${n}” fixada no dashboard ${d.name}`);
    } else toast.success(`Análise “${a.name}” guardada`);
    setName("");
  };

  return (
    <div>
      <PageHeader title="Estatísticas" subtitle="Compare qualquer período com o mesmo período de N-1, N-2 e N-3, agrupado como quiser."
        actions={<Button variant="outline" onClick={() => exportCsv(res, q)}><Download />CSV</Button>} />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-5 p-4">
            <div className="space-y-1.5">
              <Label>Período base</Label>
              <Select value={q.period.kind} onValueChange={(v) => set({ period: { ...q.period, kind: v as PeriodKind } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PERIOD_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {q.period.kind === "custom" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Input type="date" value={q.period.from ?? ""} onChange={(e) => set({ period: { ...q.period, from: e.target.value } })} />
                  <Input type="date" value={q.period.to ?? ""} onChange={(e) => set({ period: { ...q.period, to: e.target.value } })} />
                </div>
              )}
              <div className="space-y-0.5 pt-1 text-[11px] text-muted-foreground">
                {res.offsets.map((k) => <div key={k} className="num"><span className="inline-block w-12 font-medium" style={{ color: OFFSET_COLOR[k] }}>{rangeLabel(res.ranges[k])}</span>{fmtDatePt(res.ranges[k].from)} → {fmtDatePt(res.ranges[k].to)}</div>)}
              </div>
            </div>

            <div className="space-y-1.5"><Label>Comparar com</Label><YearsPicker value={q.compare} onChange={(v) => set({ compare: v })} /></div>

            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["swim", "bike", "run", "brick", "strength"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm"><Checkbox checked={q.sports!.includes(s)} onCheckedChange={() => set({ sports: toggle(q.sports!, s, 9) })} />{SPORT_LABEL[s]}</label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Nenhuma marcada = todas.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Agrupar por (até 2 níveis, por ordem)</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIMS.map((d) => {
                  const pos = q.groupBy.indexOf(d.key);
                  return (
                    <button key={d.key} onClick={() => set({ groupBy: toggle(q.groupBy, d.key, 2) })}
                      className={"rounded-full border px-2.5 py-1 text-xs transition-colors " + (pos >= 0 ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>
                      {pos >= 0 && <span className="mr-1 font-semibold">{pos + 1}</span>}{d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Métricas e agregação</Label>
              <div className="max-h-72 space-y-1 overflow-auto pr-1">
                {METRICS.map((m) => {
                  const on = q.metrics.includes(m.key);
                  return (
                    <div key={m.key} className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-1.5 text-sm"><Checkbox checked={on} onCheckedChange={() => set({ metrics: toggle(q.metrics, m.key, 5) })} />{m.label}</label>
                      {on && m.aggs.length > 1 && (
                        <Select value={q.agg?.[m.key] ?? m.defaultAgg} onValueChange={(v) => set({ agg: { ...q.agg, [m.key]: v as Agg } })}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{m.aggs.map((a) => <SelectItem key={a} value={a}>{AGG_LABEL[a]}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Até 5 métricas. Métricas de saúde só se agrupam por dimensões de tempo.</p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label>Guardar análise</Label>
              <Input placeholder={autoName(q)} value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => save(false)}><Save />Guardar</Button>
                <Button size="sm" className="flex-1" onClick={() => save(true)}><Pin />Fixar no dashboard</Button>
              </div>
            </div>

            {!!analyses.data?.length && (
              <div className="space-y-1.5 border-t pt-4">
                <Label>Análises guardadas</Label>
                {analyses.data.map((a) => (
                  <div key={a.id} className="flex items-center gap-1">
                    <button className="flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => { setQ({ ...DEFAULT_Q, ...a.query }); setChart(a.chart); }}>{a.name}</button>
                    <button className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={async () => { await store.deleteAnalysis(a.id); qc.invalidateQueries({ queryKey: ["analyses"] }); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <SummaryStrip res={res} />
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle>{autoName(q)}</CardTitle>
              <div className="flex items-center gap-2">
                {chart !== "table" && (
                  <Select value={metricForChart} onValueChange={setChartMetric}>
                    <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{q.metrics.filter((k) => chart === "bars" || METRIC[k].defaultAgg === "sum").map((k) => <SelectItem key={k} value={k}>{METRIC[k].label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Tabs value={chart} onValueChange={(v) => setChart(v as ChartKind)}>
                  <TabsList>
                    <TabsTrigger value="table"><Table2 className="mr-1 h-3.5 w-3.5" />Tabela</TabsTrigger>
                    <TabsTrigger value="bars"><BarChart3 className="mr-1 h-3.5 w-3.5" />Barras</TabsTrigger>
                    <TabsTrigger value="cumulative"><LineIcon className="mr-1 h-3.5 w-3.5" />Acumulado</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {q.metrics.length === 0 ? <p className="text-sm text-muted-foreground">Escolha pelo menos uma métrica.</p>
                : chart === "table" ? <CompareTable res={res} metrics={q.metrics} />
                : chart === "bars" ? <div className="h-[420px]"><StatsBars res={barRes} metric={metricForChart} /></div>
                : METRIC[metricForChart].defaultAgg !== "sum" ? <p className="text-sm text-muted-foreground">O acumulado só se aplica a métricas de soma (distância, tempo, carga…).</p>
                : <div className="h-[420px]"><CumulativeChart metric={metricForChart} sport={q.sports!.length === 1 ? q.sports![0] : "all"} compare={q.compare} period={q.period.kind === "year" ? "ytd" : q.period.kind} /></div>}
              {chart === "cumulative" && q.sports!.length > 1 && <p className="pt-2 text-[11px] text-muted-foreground">O acumulado usa todas as modalidades quando há mais de uma selecionada.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({ res }: { res: StatsResult }) {
  const keys = Object.keys(res.total).slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {keys.map((k) => {
        const m = METRIC[k];
        const cur = res.total[k][0];
        const p1 = res.offsets[1] != null ? res.total[k][res.offsets[1]] : null;
        const pct = cur != null && p1 != null && p1 !== 0 ? ((cur - p1) / Math.abs(p1)) * 100 : null;
        const good = pct == null ? true : m.higherIsBetter ? pct >= 0 : pct <= 0;
        return (
          <Card key={k} className="p-3">
            <div className="text-[11px] text-muted-foreground">{m.label}</div>
            <div className="num text-xl font-semibold">{cur == null ? "–" : m.format(cur)} <span className="text-xs font-normal text-muted-foreground">{m.unit === "h" ? "" : m.unit}</span></div>
            {pct != null && <div className={"num text-xs " + (good ? "text-good" : "text-bad")}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs {rangeLabel(res.ranges[res.offsets[1]])}</div>}
          </Card>
        );
      })}
    </div>
  );
}

function autoName(q: StatsQuery) {
  const dims = q.groupBy.map((g) => DIMS.find((d) => d.key === g)?.label.toLowerCase()).join(" → ");
  const sp = q.sports?.length ? q.sports.map((s) => SPORT_LABEL[s as keyof typeof SPORT_LABEL]).join(", ") : "Todas as modalidades";
  return `${sp} · ${PERIOD_LABEL[q.period.kind]}${dims ? ` · por ${dims}` : ""}`;
}

function exportCsv(res: StatsResult, q: StatsQuery) {
  const head = ["Grupo", "Subgrupo", ...q.metrics.flatMap((m) => res.offsets.map((k) => `${METRIC[m].label} ${rangeLabel(res.ranges[k])}`))];
  const lines: string[][] = [head];
  const cell = (v: number | null | undefined) => (v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
  const walk = (r: StatsRow, parent?: string) => {
    lines.push([parent ?? r.label, parent ? r.label : "", ...q.metrics.flatMap((m) => res.offsets.map((k) => cell(r.values[m]?.[k])))]);
    r.children?.forEach((c) => walk(c, r.label));
  };
  res.rows.forEach((r) => walk(r));
  lines.push(["Total", "", ...q.metrics.flatMap((m) => res.offsets.map((k) => cell(res.total[m]?.[k])))]);
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `tricoach-estatisticas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
