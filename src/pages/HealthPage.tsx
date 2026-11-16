import { useState } from "react";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthTrend, HEALTH_METRICS } from "@/components/viz";
import { baseline } from "@/lib/engine/health";
import { fmtDuration } from "@/lib/dates";

export default function HealthPage() {
  const { derived } = useLoaded();
  const [days, setDays] = useState("90");
  const status = (k: string) => {
    const m = HEALTH_METRICS[k];
    const b = baseline(derived.idx, m.key, derived.today);
    if (b.mean7 == null || b.low == null) return { txt: "sem base", cls: "text-muted-foreground", v: "–" };
    const below = b.mean7 < b.low, above = b.mean7 > b.high!;
    const bad = m.higherIsBetter ? below : above;
    const good = m.higherIsBetter ? above : below;
    const sc = m.scale ?? 1;
    const v = k === "sleep" ? fmtDuration(b.mean7) : `${(b.mean7 * sc).toFixed(0)} ${m.unit}`;
    return { v, txt: bad ? "fora da banda (desfavorável)" : good ? "acima do habitual" : "dentro da banda normal", cls: bad ? "text-bad" : good ? "text-good" : "text-muted-foreground" };
  };
  return (
    <div>
      <PageHeader title="Saúde e recuperação" subtitle="Cada métrica comparada com a sua própria base: média 7 dias vs banda normal dos 60 dias anteriores."
        actions={<Tabs value={days} onValueChange={setDays}><TabsList>{["30", "90", "180", "365"].map((d) => <TabsTrigger key={d} value={d}>{d} d</TabsTrigger>)}</TabsList></Tabs>} />
      <div className="grid gap-6 lg:grid-cols-2">
        {Object.entries(HEALTH_METRICS).map(([k, m]) => {
          const s = status(k);
          return (
            <Card key={k}>
              <CardHeader>
                <div className="flex items-baseline justify-between">
                  <CardTitle>{m.label}</CardTitle>
                  <span className="num text-lg font-semibold">{s.v}</span>
                </div>
                <CardDescription className={s.cls}>Média 7 dias {s.txt}</CardDescription>
              </CardHeader>
              <CardContent className="h-60"><HealthTrend metric={k} days={Number(days)} /></CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
