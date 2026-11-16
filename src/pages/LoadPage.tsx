import { useState } from "react";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadChart, WeeklyLoad, ZonesBar, Heatmap } from "@/components/viz";
import { weeklyRamp } from "@/lib/engine/load";

export default function LoadPage() {
  const { derived } = useLoaded();
  const [days, setDays] = useState("180");
  const t = derived.load.at(-1)!;
  const ramp = weeklyRamp(derived.load, derived.today);
  const kpis = [
    { l: "Forma (CTL)", v: t.ctl.toFixed(0), d: "média de carga a 42 dias" },
    { l: "Fadiga (ATL)", v: t.atl.toFixed(0), d: "média de carga a 7 dias" },
    { l: "Frescura (TSB)", v: t.tsb.toFixed(0), d: t.tsb < -30 ? "fadiga elevada" : t.tsb > 5 ? "fresco" : "zona produtiva", warn: t.tsb < -30 },
    { l: "Rampa semanal", v: ramp == null ? "–" : Math.abs(ramp) < 0.05 ? "0,0" : `${ramp > 0 ? "+" : "−"}${Math.abs(ramp).toFixed(1).replace(".", ",")}`, d: "variação de CTL em 7 dias (limite 7)", warn: (ramp ?? 0) > 7 },
  ];
  return (
    <div>
      <PageHeader title="Carga e forma" subtitle="TSS calculado por potência, ritmo ou FC; CTL/ATL por médias exponenciais de 42 e 7 dias." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.l} className="p-4">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={"num text-3xl font-semibold " + (k.warn ? "text-warn" : "")}>{k.v}</div>
            <div className="text-[11px] text-muted-foreground">{k.d}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>CTL / ATL / TSB</CardTitle>
            <Tabs value={days} onValueChange={setDays}><TabsList>{["90", "180", "365", "1460"].map((d) => <TabsTrigger key={d} value={d}>{d === "1460" ? "4 anos" : `${d} d`}</TabsTrigger>)}</TabsList></Tabs>
          </CardHeader>
          <CardContent className="h-80"><LoadChart days={Number(days)} /></CardContent>
        </Card>
        <Card className="lg:col-span-8">
          <CardHeader><CardTitle>Carga semanal por modalidade · 16 semanas</CardTitle></CardHeader>
          <CardContent className="h-72"><WeeklyLoad weeks={16} /></CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle>Tempo em zonas · 28 dias</CardTitle><CardDescription>Exclui força</CardDescription></CardHeader>
          <CardContent><ZonesBar days={28} /><div className="mt-6 border-t pt-4"><div className="mb-2 text-xs text-muted-foreground">90 dias</div><ZonesBar days={90} /></div></CardContent>
        </Card>
        <Card className="lg:col-span-12">
          <CardHeader><CardTitle>Calendário de carga · 52 semanas</CardTitle></CardHeader>
          <CardContent><Heatmap weeks={52} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
