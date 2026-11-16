import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw, Trophy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { useLoaded } from "@/lib/data/DataProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty } from "@/components/common";
import { analyse, similarActivities, summaryEf } from "@/lib/engine/analysis";
import { prsIn } from "@/lib/engine/bests";
import { activityTss } from "@/lib/engine/load";
import { fmtDatePt, fmtDuration, fmtPace } from "@/lib/dates";
import { SESSION_LABEL, SPORT_COLOR, SPORT_LABEL, type Activity, type ActivityStreams } from "@/lib/types";
import { cn } from "@/lib/utils";

const fmtClock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.round(s % 60); return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };

function speedLabel(a: Activity, mps: number | null | undefined): string {
  if (!mps || mps <= 0) return "–";
  if (a.sport === "run") return `${fmtPace(1000 / mps)} /km`;
  if (a.sport === "swim") return `${fmtPace(100 / mps)} /100m`;
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

export default function ActivityDetailPage() {
  const { id } = useParams();
  const { core, store } = useLoaded();
  const a = core.activities.find((x) => x.id === id);
  const q = useQuery({ queryKey: ["streams", store.mode, id], queryFn: () => store.getStreams(a!), enabled: !!a, retry: false, staleTime: Infinity });
  const [refreshing, setRefreshing] = useState(false);

  if (!a) return <div className="space-y-4"><BackLink /><Empty>Atividade não encontrada.</Empty></div>;
  const s = q.data ?? null;
  const an = analyse(a, s, core.profile);
  const prs = prsIn(a, core.activities);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SPORT_COLOR[a.sport] }} />{SPORT_LABEL[a.sport]}{a.sessionType && ` · ${SESSION_LABEL[a.sessionType]}`} · {fmtDatePt(a.date)}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.name || "Atividade"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {prs.map((p) => <Badge key={p.key} variant="warn"><Trophy className="h-3 w-3" />Recorde {p.label}</Badge>)}
          {store.mode === "supabase" && (
            <Button variant="outline" size="sm" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await store.getStreams(a, true); await q.refetch(); } finally { setRefreshing(false); } }}>
              {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}Voltar a ler o FIT
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi l="Distância" v={a.distanceM ? `${(a.distanceM / 1000).toFixed(a.sport === "swim" ? 2 : 1)} km` : "–"} />
        <Kpi l="Tempo" v={fmtDuration(a.durationS)} />
        <Kpi l={a.sport === "bike" ? "Velocidade" : "Ritmo"} v={speedLabel(a, a.durationS ? a.distanceM / a.durationS : null)} />
        <Kpi l="FC média" v={a.avgHr ? `${a.avgHr} bpm` : "–"} />
        <Kpi l={a.sport === "bike" ? "NP · IF" : "Carga"} v={a.sport === "bike" && an.np ? `${an.np} W · ${an.IF?.toFixed(2)}` : `${an.tss} TSS`} />
        <Kpi l="Desacoplamento" v={an.decoupling ? `${an.decoupling.pct.toFixed(1)}%` : "–"} hint={an.decoupling ? (an.decoupling.pct < 5 ? "boa base aeróbia" : "acima de 5%") : a.sessionType === "intervals" || a.sessionType === "race" ? "só em treinos contínuos" : s ? "sem dados" : undefined} tone={an.decoupling ? (an.decoupling.pct < 5 ? "good" : "warn") : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle>Evolução no treino</CardTitle><CardDescription>{store.mode === "supabase" ? "Do ficheiro FIT da Garmin, uma amostra a cada 5 s." : "Modo demo: séries simuladas."}</CardDescription></CardHeader>
        <CardContent>
          {q.isLoading ? <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A descarregar e ler o ficheiro FIT…</div>
            : q.error ? <Empty>Não foi possível ler o ficheiro: {(q.error as Error).message}</Empty>
            : s ? <StreamsChart a={a} s={s} /> : <Empty>Sem séries temporais.</Empty>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Tempo em zonas de FC</CardTitle><CardDescription>% do LTHR ({core.profile.lthr} bpm)</CardDescription></CardHeader>
          <CardContent><ZoneBars z={an.hrZones} /></CardContent>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Voltas ({an.laps.length})</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            {an.laps.length ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr>{["#", "Tempo", "Distância", a.sport === "bike" ? "Velocidade" : "Ritmo", "FC", ...(a.sport === "bike" ? ["Potência"] : [])].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {an.laps.map((l) => (
                    <tr key={l.index} className="border-b border-border/50">
                      <td className="num py-1.5 pr-3 text-muted-foreground">{l.index}</td>
                      <td className="num py-1.5 pr-3">{fmtClock(l.durationS)}</td>
                      <td className="num py-1.5 pr-3">{l.distanceM >= 1000 ? `${(l.distanceM / 1000).toFixed(2)} km` : `${l.distanceM} m`}</td>
                      <td className="num py-1.5 pr-3">{speedLabel(a, l.avgSpeed)}</td>
                      <td className="num py-1.5 pr-3">{l.avgHr ?? "–"}</td>
                      {a.sport === "bike" && <td className="num py-1.5 pr-3">{l.avgPower ? `${l.avgPower} W` : "–"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Sem voltas.</Empty>}
          </CardContent>
        </Card>
      </div>

      <SimilarCard a={a} />
    </div>
  );
}

function BackLink() {
  return <Link to="/atividades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Atividades</Link>;
}

function Kpi({ l, v, hint, tone }: { l: string; v: string; hint?: string; tone?: "good" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className={cn("num mt-0.5 text-xl font-semibold", tone === "good" && "text-good", tone === "warn" && "text-warn")}>{v}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function StreamsChart({ a, s }: { a: Activity; s: ActivityStreams }) {
  const hasPower = !!s.power?.some((x) => x != null);
  const [metric, setMetric] = useState<"speed" | "power">(hasPower ? "power" : "speed");
  const step = Math.max(1, Math.ceil(s.t.length / 900));
  const pace = (v: number | null | undefined) => (v && v > 0.3 ? (a.sport === "run" ? 1000 / v : a.sport === "swim" ? 100 / v : v * 3.6) : null);
  const data = useMemo(() => s.t.filter((_, i) => i % step === 0).map((t, j) => {
    const i = j * step;
    return { t, hr: s.hr?.[i] ?? null, power: s.power?.[i] ?? null, speed: pace(s.speed?.[i]), alt: s.alt?.[i] ?? null };
  }), [s, step]);
  const inverted = a.sport !== "bike"; // ritmo: menor é melhor → eixo invertido
  const config = {
    hr: { label: "FC", color: "hsl(var(--bad))" },
    power: { label: "Potência", color: "hsl(var(--primary))" },
    speed: { label: a.sport === "bike" ? "Velocidade" : "Ritmo", color: "hsl(var(--primary))" },
    alt: { label: "Altitude", color: "hsl(var(--muted-foreground))" },
  } satisfies ChartConfig;
  const fmtVal = (k: string, v: number) => k === "speed" ? (a.sport === "bike" ? `${v.toFixed(1)} km/h` : `${fmtPace(v)} ${a.sport === "swim" ? "/100m" : "/km"}`) : k === "power" ? `${Math.round(v)} W` : k === "hr" ? `${Math.round(v)} bpm` : `${Math.round(v)} m`;
  return (
    <div className="space-y-3">
      {hasPower && (
        <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
          <TabsList><TabsTrigger value="power">Potência</TabsTrigger><TabsTrigger value="speed">Velocidade</TabsTrigger></TabsList>
        </Tabs>
      )}
      <ChartContainer config={config} className="h-80">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => fmtClock(Number(v))} minTickGap={50} />
          <YAxis yAxisId="m" tickLine={false} axisLine={false} width={52} reversed={metric === "speed" && inverted} domain={["auto", "auto"]}
            tickFormatter={(v) => (metric === "speed" && a.sport !== "bike" ? fmtPace(Number(v)) : String(Math.round(Number(v))))} />
          <YAxis yAxisId="hr" orientation="right" tickLine={false} axisLine={false} width={36} domain={["dataMin - 10", "dataMax + 5"]} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtClock(Number(v))} formatter={(value: any, name: any, item: any) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item?.color }} />{(config as any)[name]?.label ?? name}</span>
              <span className="num font-medium text-foreground">{value == null ? "–" : fmtVal(String(name), Number(value))}</span>
            </div>)} />} />
          <Line yAxisId="m" dataKey={metric} type="monotone" stroke={`var(--color-${metric})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="hr" dataKey="hr" type="monotone" stroke="var(--color-hr)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
      {!!s.alt?.length && a.elevationM > 0 && (
        <ChartContainer config={config} className="h-20">
          <AreaChart data={data} margin={{ top: 0, right: 44, left: 52, bottom: 0 }}>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
            <ChartTooltip content={<ChartTooltipContent hideIndicator labelFormatter={(v) => fmtClock(Number(v))} formatter={(v: any) => <span className="num">{Math.round(Number(v))} m de altitude</span>} />} />
            <Area dataKey="alt" type="monotone" stroke="var(--color-alt)" strokeWidth={1} fill="var(--color-alt)" fillOpacity={0.2} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

function ZoneBars({ z }: { z: number[] }) {
  const tot = z.reduce((s, x) => s + x, 0) || 1;
  return (
    <div className="space-y-2.5">
      {z.map((sec, i) => (
        <div key={i} className="grid grid-cols-[28px_1fr_88px] items-center gap-3 text-xs">
          <span className="font-medium">Z{i + 1}</span>
          <div className="h-2.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(sec / tot) * 100}%`, background: `hsl(var(--zone-${i + 1}))` }} /></div>
          <span className="num text-right text-muted-foreground">{fmtDuration(sec)} · {Math.round((sec / tot) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function SimilarCard({ a }: { a: Activity }) {
  const { core } = useLoaded();
  const list = similarActivities(a, core.activities);
  const ef0 = summaryEf(a);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Treinos semelhantes</CardTitle>
        <CardDescription>Mesma modalidade e tipo, duração ±25%, últimos 12 meses. Eficiência = {a.sport === "bike" ? "NP ÷ FC" : "velocidade (m/min) ÷ FC"}: mais alta é melhor.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {list.length ? (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>{["Data", "Treino", "Tempo", a.sport === "bike" ? "NP" : "Ritmo", "FC", "Eficiência", "TSS"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              <tr className="border-b border-border/50 bg-primary/5 font-medium">
                <td className="py-1.5 pr-3">Este</td><td className="truncate py-1.5 pr-3">{a.name}</td><td className="num py-1.5 pr-3">{fmtDuration(a.durationS)}</td>
                <td className="num py-1.5 pr-3">{a.sport === "bike" ? (a.normPower ? `${a.normPower} W` : "–") : speedLabel(a, a.distanceM / a.durationS)}</td>
                <td className="num py-1.5 pr-3">{a.avgHr ?? "–"}</td><td className="num py-1.5 pr-3">{ef0?.toFixed(2) ?? "–"}</td><td className="num py-1.5 pr-3">{Math.round(activityTss(a, core.profile))}</td>
              </tr>
              {list.map((x) => {
                const ef = summaryEf(x);
                const better = ef0 != null && ef != null ? ef0 > ef : null;
                return (
                  <tr key={x.id} className="border-b border-border/50">
                    <td className="num whitespace-nowrap py-1.5 pr-3 text-muted-foreground">{fmtDatePt(x.date)}</td>
                    <td className="py-1.5 pr-3"><Link to={`/atividades/${x.id}`} className="hover:underline">{x.name}</Link></td>
                    <td className="num py-1.5 pr-3">{fmtDuration(x.durationS)}</td>
                    <td className="num py-1.5 pr-3">{x.sport === "bike" ? (x.normPower ? `${x.normPower} W` : "–") : speedLabel(x, x.distanceM / x.durationS)}</td>
                    <td className="num py-1.5 pr-3">{x.avgHr ?? "–"}</td>
                    <td className="num py-1.5 pr-3">{ef?.toFixed(2) ?? "–"}{better != null && <span className={cn("ml-1 text-[10px]", better ? "text-good" : "text-bad")}>{better ? "▲ hoje" : "▼ hoje"}</span>}</td>
                    <td className="num py-1.5 pr-3">{Math.round(activityTss(x, core.profile))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>Sem treinos comparáveis nos últimos 12 meses.</Empty>}
      </CardContent>
    </Card>
  );
}
