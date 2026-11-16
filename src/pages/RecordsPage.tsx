import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader, OFFSET_COLOR, Empty } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BESTS, computeBests, fmtDurationLabel, powerCurve, type BestDef, type BestHit } from "@/lib/engine/bests";
import { fmtDatePt, fmtPace, year } from "@/lib/dates";
import { cn } from "@/lib/utils";

function fmtBest(d: BestDef, v: number) {
  if (d.kind === "power") return `${Math.round(v)} W`;
  const s = Math.round(v);
  if (d.sport === "swim" || s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
/** ritmo equivalente, para dar contexto ao tempo */
function paceOf(d: BestDef, v: number) {
  if (d.kind === "power") return null;
  const m = Number(d.key.split("_")[1]);
  return d.sport === "swim" ? `${fmtPace(v / (m / 100))}/100m` : d.sport === "run" ? `${fmtPace(v / (m / 1000))}/km` : `${((m / 1000) / (v / 3600)).toFixed(1)} km/h`;
}

export default function RecordsPage() {
  const { core, derived } = useLoaded();
  const { allTime, byYear } = useMemo(() => computeBests(core.activities), [core.activities]);
  const y0 = year(derived.today);
  const years = [y0, y0 - 1, y0 - 2, y0 - 3];
  const groups = [...new Set(BESTS.map((b) => b.group))];

  const curve = useMemo(() => {
    const per = years.slice(0, 3).map((y) => powerCurve(core.activities.filter((a) => year(a.date) === y)));
    const all = powerCurve(core.activities);
    return all.map((p, i) => ({ d: fmtDurationLabel(p.duration), all: p.watts, ...Object.fromEntries(per.map((c, k) => [`y${k}`, c[i].watts])) }));
  }, [core.activities]);
  const curveConfig: ChartConfig = {
    all: { label: "Melhor de sempre", color: "hsl(var(--muted-foreground))" },
    y0: { label: String(years[0]), color: OFFSET_COLOR[0] },
    y1: { label: String(years[1]), color: OFFSET_COLOR[1] },
    y2: { label: String(years[2]), color: OFFSET_COLOR[2] },
  };

  const cell = (d: BestDef, hit: BestHit | undefined, best: BestHit | undefined) => {
    if (!hit) return <span className="text-muted-foreground">–</span>;
    const isPr = best && hit.activityId === best.activityId;
    return (
      <Link to={`/atividades/${hit.activityId}`} className={cn("num hover:underline", isPr && "font-semibold text-warn")} title={`${hit.name} · ${fmtDatePt(hit.date)}`}>{fmtBest(d, hit.value)}</Link>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Recordes" subtitle="Melhores marcas de sempre e de cada ano, a partir dos parciais mais rápidos e das potências máximas que a Garmin calcula em cada atividade." />

      <Card>
        <CardHeader><CardTitle>Curva de potência</CardTitle><CardDescription>Melhor potência média por duração · ano atual vs anteriores vs melhor de sempre</CardDescription></CardHeader>
        <CardContent>
          {curve.some((c) => c.all) ? (
            <ChartContainer config={curveConfig} className="h-80">
              <LineChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="d" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v}`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v: any, name: any, item: any) => (
                  <div className="flex w-full items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item?.color }} />{(curveConfig as any)[name]?.label}</span><span className="num font-medium text-foreground">{v == null ? "–" : `${v} W`}</span></div>)} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="all" stroke="var(--color-all)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
                <Line dataKey="y2" stroke="var(--color-y2)" strokeWidth={1.5} dot={false} />
                <Line dataKey="y1" stroke="var(--color-y1)" strokeWidth={1.5} dot={false} />
                <Line dataKey="y0" stroke="var(--color-y0)" strokeWidth={2.5} dot={{ r: 2.5 }} />
              </LineChart>
            </ChartContainer>
          ) : <Empty>Sem dados de potência.</Empty>}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {groups.map((g) => (
          <Card key={g}>
            <CardHeader><CardTitle>{g}</CardTitle><CardDescription>A laranja: o ano em que foi batido o recorde. Toque num valor para abrir a atividade.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="pb-2 pr-3 font-medium"></th><th className="pb-2 pr-3 font-medium">Sempre</th>{years.map((y, k) => <th key={y} className="pb-2 pr-3 font-medium" style={{ color: OFFSET_COLOR[k] }}>{y}</th>)}</tr>
                </thead>
                <tbody>
                  {BESTS.filter((b) => b.group === g).map((d) => {
                    const best = allTime[d.key];
                    return (
                      <tr key={d.key} className="border-b border-border/50 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 font-medium">{d.label}</td>
                        <td className="py-2 pr-3">
                          {best ? <div><Link to={`/atividades/${best.activityId}`} className="num font-semibold hover:underline">{fmtBest(d, best.value)}</Link><div className="text-[10px] text-muted-foreground">{[paceOf(d, best.value), fmtDatePt(best.date)].filter(Boolean).join(" · ")}</div></div> : <span className="text-muted-foreground">–</span>}
                        </td>
                        {years.map((y) => <td key={y} className="py-2 pr-3">{cell(d, byYear[y]?.[d.key], best)}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
