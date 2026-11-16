import React, { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useLoaded } from "@/lib/data/DataProvider";
import { addDays, fmtDatePt, fmtDuration, MONTHS_PT, startOfWeek, month } from "@/lib/dates";
import { baseline, type WellnessKey } from "@/lib/engine/health";
import { zoneDistribution, activityTss } from "@/lib/engine/load";
import { METRIC, cumulative, runStats, delta, isGood, rangeLabel, type StatsQuery, type StatsResult, type StatsRow } from "@/lib/engine/stats";
import { SPORT_COLOR, SPORT_LABEL, type Sport } from "@/lib/types";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { OFFSET_COLOR, DeltaBadge, Empty } from "./common";
import { cn } from "@/lib/utils";

// Todos os gráficos usam o ChartContainer do shadcn: as cores vêm do ChartConfig (tokens do tema) e chegam às séries como var(--color-<chave>).

const compact = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(v)));
const shortDate = (d: string) => `${Number(d.slice(8))} ${MONTHS_PT[month(d) - 1]}`;
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const;
const grid = { vertical: false, strokeDasharray: "3 3" } as const;

/** Linha de tooltip com indicador, rótulo do ChartConfig e valor formatado. */
function row(config: ChartConfig, fmt: (v: any, key: string) => string) {
  return (value: any, name: any, item: any) => (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: item?.color ?? item?.payload?.fill }} />
        {config[String(name)]?.label ?? name}
      </span>
      <span className="num font-medium text-foreground">{fmt(value, String(name))}</span>
    </div>
  );
}

// ───────────── Carga e forma ─────────────
const loadConfig = {
  ctl: { label: "Forma (CTL)", color: "hsl(var(--ctl))" },
  atl: { label: "Fadiga (ATL)", color: "hsl(var(--atl))" },
  tsb: { label: "Frescura (TSB)", color: "hsl(var(--good))" },
} satisfies ChartConfig;

export function LoadChart({ days = 120, className }: { days?: number; className?: string }) {
  const { derived } = useLoaded();
  const data = derived.load.slice(-days).map((l) => ({ date: l.date, ctl: +l.ctl.toFixed(1), atl: +l.atl.toFixed(1), tsb: +l.tsb.toFixed(1) }));
  return (
    <ChartContainer config={loadConfig} className={className}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...axis} width={48} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => fmtDatePt(String(d))} formatter={row(loadConfig, (v) => String(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <ReferenceLine y={-30} stroke="hsl(var(--bad) / .5)" strokeDasharray="4 4" />
        <Bar dataKey="tsb" barSize={3} fill="var(--color-tsb)">
          {data.map((d) => <Cell key={d.date} fill={d.tsb >= 0 ? "hsl(var(--good) / .6)" : d.tsb < -30 ? "hsl(var(--bad) / .75)" : "hsl(var(--warn) / .55)"} />)}
        </Bar>
        <Line dataKey="ctl" stroke="var(--color-ctl)" dot={false} strokeWidth={2.25} type="monotone" />
        <Line dataKey="atl" stroke="var(--color-atl)" dot={false} strokeWidth={1.5} type="monotone" />
      </ComposedChart>
    </ChartContainer>
  );
}

// ───────────── Tendência de saúde com banda pessoal ─────────────
export const HEALTH_METRICS: Record<string, { key: WellnessKey; label: string; unit: string; scale?: number; higherIsBetter: boolean }> = {
  hrv: { key: "hrv", label: "HRV", unit: "ms", higherIsBetter: true },
  rhr: { key: "rhr", label: "FC repouso", unit: "bpm", higherIsBetter: false },
  sleep: { key: "sleepS", label: "Sono", unit: "h", scale: 1 / 3600, higherIsBetter: true },
  stress: { key: "stressAvg", label: "Stress", unit: "", higherIsBetter: false },
  bb: { key: "bbMorning", label: "Body Battery ao acordar", unit: "", higherIsBetter: true },
};

export function HealthTrend({ metric = "hrv", days = 60, className }: { metric?: string; days?: number; className?: string }) {
  const { derived } = useLoaded();
  const m = HEALTH_METRICS[metric] ?? HEALTH_METRICS.hrv;
  const sc = m.scale ?? 1;
  const config = {
    value: { label: m.label, color: "hsl(var(--muted-foreground))" },
    mean7: { label: "Média 7 dias", color: "hsl(var(--primary))" },
    band: { label: "Banda normal (60 d)", color: "hsl(var(--primary))" },
  } satisfies ChartConfig;
  const data = useMemo(() => Array.from({ length: days }, (_, i) => {
    const d = addDays(derived.today, i - days + 1);
    const v = derived.idx.get(d)?.[m.key];
    const b = baseline(derived.idx, m.key, d);
    return {
      date: d,
      value: v == null ? null : +(v * sc).toFixed(2),
      mean7: b.mean7 == null ? null : +(b.mean7 * sc).toFixed(2),
      band: b.low == null ? null : [+(b.low * sc).toFixed(2), +(b.high! * sc).toFixed(2)],
    };
  }), [derived, metric, days]);
  if (!data.some((d) => d.value != null)) return <Empty>Sem dados de {m.label.toLowerCase()}</Empty>;
  const f = (v: any): string => (Array.isArray(v) ? `${f(v[0])}–${f(v[1])}` : metric === "sleep" ? fmtDuration(Number(v) * 3600) : String(Math.round(Number(v))));
  return (
    <ChartContainer config={config} className={className}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...axis} width={48} domain={["auto", "auto"]} tickFormatter={(v) => (metric === "sleep" ? `${Number(v).toFixed(1).replace(".", ",")}h` : String(Math.round(v)))} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => fmtDatePt(String(d))} formatter={row(config, f)} />} />
        <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.12} isAnimationActive={false} />
        <Bar dataKey="value" barSize={days > 45 ? 3 : 8} fill="var(--color-value)" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
        <Line dataKey="mean7" stroke="var(--color-mean7)" strokeWidth={2.25} dot={false} type="monotone" />
      </ComposedChart>
    </ChartContainer>
  );
}

// ───────────── Carga semanal por modalidade ─────────────
const SPORTS_STACK: Sport[] = ["swim", "bike", "run", "brick", "strength"];
const sportConfig = Object.fromEntries(SPORTS_STACK.map((s) => [s, { label: SPORT_LABEL[s], color: SPORT_COLOR[s] }])) satisfies ChartConfig;

export function WeeklyLoad({ weeks = 12, className }: { weeks?: number; className?: string }) {
  const { derived } = useLoaded();
  const data = useMemo(() => {
    const out: Record<string, any>[] = [];
    const first = startOfWeek(addDays(derived.today, -(weeks - 1) * 7));
    for (let w = 0; w < weeks; w++) {
      const ws = addDays(first, w * 7);
      const r: Record<string, any> = { week: ws };
      for (const l of derived.load) if (l.date >= ws && l.date < addDays(ws, 7)) for (const [s, t] of Object.entries(l.bySport)) r[s] = (r[s] ?? 0) + Math.round(t!);
      out.push(r);
    }
    return out;
  }, [derived, weeks]);
  return (
    <ChartContainer config={sportConfig} className={className}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="week" {...axis} tickFormatter={shortDate} minTickGap={20} />
        <YAxis {...axis} width={48} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Semana de ${fmtDatePt(String(d))}`} formatter={row(sportConfig, (v) => `${v} TSS`)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {SPORTS_STACK.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={`var(--color-${s})`} radius={i === SPORTS_STACK.length - 1 ? [4, 4, 0, 0] : 0} />)}
      </BarChart>
    </ChartContainer>
  );
}

// ───────────── Distribuição por zonas ─────────────
export function ZonesBar({ days = 28 }: { days?: number }) {
  const { core, derived } = useLoaded();
  const z = zoneDistribution(core.activities.filter((a) => a.sport !== "strength"), core.profile, addDays(derived.today, -(days - 1)), derived.today);
  const colors = [1, 2, 3, 4, 5].map((z) => `hsl(var(--zone-${z}))`);
  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {z.map((p, i) => <div key={i} style={{ width: `${p}%`, background: colors[i] }} title={`Z${i + 1}: ${p.toFixed(0)}%`} />)}
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {z.map((p, i) => (
          <div key={i}>
            <div className="text-[11px] text-muted-foreground">Z{i + 1}</div>
            <div className={cn("num text-sm font-semibold", i === 2 && p > 25 && "text-warn")}>{p.toFixed(0)}%</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Polarizado: ≥ 75% em Z1–Z2 ({(z[0] + z[1]).toFixed(0)}%), Z3 abaixo de 25%.</p>
    </div>
  );
}

// ───────────── Acumulado do ano vs anos anteriores ─────────────
function yearConfig(offsets: number[], ranges: Record<number, { from: string; to: string }>): ChartConfig {
  return Object.fromEntries(offsets.map((k) => [`y${k}`, { label: rangeLabel(ranges[k]), color: OFFSET_COLOR[k] }]));
}

export function CumulativeChart({ metric = "duration", sport = "all", compare = [1, 2, 3], period = "ytd", className }: { metric?: string; sport?: string; compare?: number[]; period?: string; className?: string }) {
  const { core, derived } = useLoaded();
  const res = useMemo(() => cumulative(core.activities, metric, { period: { kind: period as any }, compare, sports: sport === "all" ? [] : [sport] }, core.profile, derived.today), [core, metric, sport, compare.join(), period]);
  const m = res.metric;
  const config = yearConfig(res.offsets, res.ranges);
  return (
    <ChartContainer config={config} className={className}>
      <LineChart data={res.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} interval={Math.floor(res.points.length / 6)} />
        <YAxis {...axis} width={52} tickFormatter={(v) => (m.key === "duration" ? `${Math.round(v)}h` : compact(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={row(config, (v) => (v == null ? "–" : `${m.format(Number(v))}${m.unit && m.unit !== "h" ? ` ${m.unit}` : ""}`))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {[...res.offsets].reverse().map((k) => (
          <Line key={k} dataKey={`y${k}`} stroke={`var(--color-y${k})`} strokeWidth={k === 0 ? 2.75 : 1.5} dot={false} connectNulls={false} strokeDasharray={k === 3 ? "4 3" : undefined} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

// ───────────── Barras por mês, agrupadas por ano ─────────────
export function PeriodBars({ metric = "duration", sport = "all", compare = [1, 2], groupBy = "month", period = "year", className }: { metric?: string; sport?: string; compare?: number[]; groupBy?: string; period?: string; className?: string }) {
  const { core, derived } = useLoaded();
  const res = useMemo(() => runStats(core.activities, core.wellness, { period: { kind: period as any }, compare, groupBy: [groupBy], metrics: [metric], sports: sport === "all" ? [] : [sport] }, core.profile, derived.today), [core, metric, sport, compare.join(), groupBy, period]);
  return <StatsBars res={res} metric={metric} className={className} />;
}

export function StatsBars({ res, metric, className }: { res: StatsResult; metric: string; className?: string }) {
  const m = METRIC[metric];
  const data = res.rows.map((r) => ({ label: r.label, ...Object.fromEntries(res.offsets.map((k) => [`y${k}`, r.values[metric]?.[k] ?? null])) }));
  if (!data.length) return <Empty>Sem dados no período</Empty>;
  const config = yearConfig(res.offsets, res.ranges);
  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} interval={0} />
        <YAxis {...axis} width={52} tickFormatter={(v) => (m.key === "duration" ? `${Math.round(v)}h` : m.bestIsMin ? m.format(v) : compact(v))} domain={m.bestIsMin ? ["dataMin - 10", "dataMax + 10"] : [0, "auto"]} />
        <ChartTooltip content={<ChartTooltipContent formatter={row(config, (v) => (v == null ? "sem dados" : `${m.format(Number(v))}${m.unit && m.unit !== "h" ? ` ${m.unit}` : ""}`))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {[...res.offsets].reverse().map((k) => <Bar key={k} dataKey={`y${k}`} fill={`var(--color-y${k})`} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ChartContainer>
  );
}

// ───────────── Tabela comparativa com agrupamentos expansíveis ─────────────
export function CompareTable({ res, metrics, dense }: { res: StatsResult; metrics: string[]; dense?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cur = res.offsets[0];
  const prev = res.offsets.slice(1);
  const ms = metrics.map((k) => METRIC[k]).filter(Boolean);
  const fmtV = (k: string, v: number | null | undefined, off: number) => (res.empty[off] ? <span className="text-muted-foreground">sem dados</span> : v == null ? "–" : METRIC[k].format(v));

  const renderRow = (r: StatsRow, depth: number, path: string): React.ReactNode[] => {
    const id = path + "/" + r.key;
    const has = !!r.children?.length;
    const rows: React.ReactNode[] = [
      <tr key={id} className={cn("border-b border-border/60 hover:bg-muted/30", depth > 0 && "text-muted-foreground")}>
        <td className="sticky left-0 bg-card py-1.5 pr-3" style={{ paddingLeft: 8 + depth * 18 }}>
          <button className={cn("inline-flex items-center gap-1", !has && "cursor-default")} onClick={() => has && setOpen((o) => ({ ...o, [id]: !o[id] }))}>
            {has && <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open[id] && "rotate-90")} />}
            <span className={cn(depth === 0 && "font-medium text-foreground")}>{r.label}</span>
          </button>
        </td>
        {ms.map((m) => (
          <React.Fragment key={m.key}>
            {res.offsets.map((k) => <td key={k} className={cn("num px-2 py-1.5 text-right", k === cur && "font-medium text-foreground")}>{fmtV(m.key, r.values[m.key]?.[k], k)}</td>)}
            {!dense && prev.map((k) => {
              const d = delta(r.values[m.key]?.[cur], r.values[m.key]?.[k]);
              return <td key={"d" + k} className="px-2 py-1.5 text-right">{d ? <DeltaBadge pct={d.pct} good={isGood(m, d.abs)} /> : <span className="text-xs text-muted-foreground">–</span>}</td>;
            })}
          </React.Fragment>
        ))}
      </tr>,
    ];
    if (has && open[id]) for (const c of r.children!) rows.push(...renderRow(c, depth + 1, id));
    return rows;
  };

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="sticky left-0 bg-card py-1.5 pl-2 text-left font-medium" rowSpan={2}></th>
            {ms.map((m) => <th key={m.key} colSpan={res.offsets.length + (dense ? 0 : prev.length)} className="px-2 pt-1.5 text-center font-semibold text-foreground">{m.label}{m.unit && m.unit !== "h" ? ` (${m.unit})` : ""}</th>)}
          </tr>
          <tr className="border-b text-muted-foreground">
            {ms.map((m) => (
              <React.Fragment key={m.key}>
                {res.offsets.map((k) => <th key={k} className="px-2 py-1 text-right font-medium" style={{ color: OFFSET_COLOR[k] }}>{rangeLabel(res.ranges[k])}</th>)}
                {!dense && prev.map((k) => <th key={"d" + k} className="px-2 py-1 text-right font-medium">Δ N-{k}</th>)}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {res.rows.flatMap((r) => renderRow(r, 0, ""))}
          <tr className="border-t-2 font-semibold">
            <td className="sticky left-0 bg-card py-1.5 pl-2">Total</td>
            {ms.map((m) => (
              <React.Fragment key={m.key}>
                {res.offsets.map((k) => <td key={k} className="num px-2 py-1.5 text-right">{fmtV(m.key, res.total[m.key]?.[k], k)}</td>)}
                {!dense && prev.map((k) => { const d = delta(res.total[m.key]?.[cur], res.total[m.key]?.[k]); return <td key={"d" + k} className="px-2 py-1.5 text-right">{d ? <DeltaBadge pct={d.pct} good={isGood(m, d.abs)} /> : "–"}</td>; })}
              </React.Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CompareTableWidget({ metrics = ["distance", "duration"], groupBy = ["sport"], period = "ytd", compare = [1, 2, 3] }: { metrics?: string[]; groupBy?: string[]; period?: string; compare?: number[] }) {
  const { core, derived } = useLoaded();
  const q: StatsQuery = { period: { kind: period as any }, compare, groupBy, metrics };
  const res = useMemo(() => runStats(core.activities, core.wellness, q, core.profile, derived.today), [core, JSON.stringify(q)]);
  return <CompareTable res={res} metrics={metrics} dense />;
}

// ───────────── Heatmap de calendário (TSS por dia) ─────────────
export function Heatmap({ weeks = 26 }: { weeks?: number }) {
  const { derived } = useLoaded();
  const first = startOfWeek(addDays(derived.today, -(weeks - 1) * 7));
  const byDay = new Map(derived.load.map((l) => [l.date, l.tss]));
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const shade = (t: number) => (t <= 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${Math.min(1, 0.18 + t / 220)})`);
  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-2">
      {/* em ecrãs estreitos o calendário desliza na horizontal em vez de alargar a página */}
      <div ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }} className="overflow-x-auto pb-1">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(8px, 1fr))`, minWidth: weeks * 11 }}>
        {cols.map((c, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {c.map((d) => <div key={d} className="h-3.5 w-full rounded-[3px]" style={{ background: d > derived.today ? "transparent" : shade(byDay.get(d) ?? 0) }} title={`${fmtDatePt(d)}: ${Math.round(byDay.get(d) ?? 0)} TSS`} />)}
          </div>
        ))}
      </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        Menos {[0, 40, 90, 150, 220].map((t) => <span key={t} className="h-2.5 w-2.5 rounded-sm" style={{ background: shade(t) }} />)} Mais (TSS/dia)
      </div>
    </div>
  );
}

// ───────────── Lista de atividades recentes ─────────────
export function RecentActivities({ limit = 8 }: { limit?: number }) {
  const { core } = useLoaded();
  const acts = core.activities.slice(0, limit);
  if (!acts.length) return <Empty>Sem atividades</Empty>;
  return (
    <ul className="divide-y divide-border/60">
      {acts.map((a) => (
        <li key={a.id}><Link to={`/atividades/${a.id}`} className="flex items-center gap-3 rounded-md py-2 hover:bg-muted/50">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SPORT_COLOR[a.sport] }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{a.name}</div>
            <div className="text-[11px] text-muted-foreground">{fmtDatePt(a.date)} · {SPORT_LABEL[a.sport]}</div>
          </div>
          <div className="num text-right text-xs">
            <div>{a.distanceM > 0 ? `${(a.distanceM / 1000).toFixed(a.sport === "swim" ? 2 : 1)} km` : ""}</div>
            <div className="text-muted-foreground">{fmtDuration(a.durationS)} · {Math.round(activityTss(a, core.profile))} TSS</div>
          </div>
        </Link></li>
      ))}
    </ul>
  );
}
