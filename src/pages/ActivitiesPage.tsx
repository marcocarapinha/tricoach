import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_LABEL, SPORT_COLOR, SPORT_LABEL, type Activity } from "@/lib/types";
import { fmtDatePt, fmtDuration, fmtPace } from "@/lib/dates";
import { activityTss, dominantZone } from "@/lib/engine/load";

const PAGE = 50;

export default function ActivitiesPage() {
  const { core } = useLoaded();
  const [sport, setSport] = useState("all");
  const [text, setText] = useState("");
  const [yr, setYr] = useState("all");
  const [n, setN] = useState(PAGE);
  const nav = useNavigate();
  const years = useMemo(() => [...new Set(core.activities.map((a) => a.date.slice(0, 4)))].sort().reverse(), [core]);
  const list = useMemo(() => core.activities.filter((a) =>
    (sport === "all" || a.sport === sport) && (yr === "all" || a.date.startsWith(yr)) && (!text || (a.name + (a.gear ?? "")).toLowerCase().includes(text.toLowerCase()))), [core, sport, text, yr]);
  const speed = (a: Activity) => {
    if (!a.distanceM) return "–";
    if (a.sport === "run") return `${fmtPace(a.durationS / (a.distanceM / 1000))} /km`;
    if (a.sport === "swim") return `${fmtPace(a.durationS / (a.distanceM / 100))} /100m`;
    return `${((a.distanceM / 1000) / (a.durationS / 3600)).toFixed(1)} km/h`;
  };
  return (
    <div>
      <PageHeader title="Atividades" subtitle={`${list.length.toLocaleString("pt-PT")} atividades`} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-56" placeholder="Pesquisar nome ou equipamento" value={text} onChange={(e) => setText(e.target.value)} />
        <Select value={sport} onValueChange={setSport}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas</SelectItem>{(["swim", "bike", "run", "brick", "strength"] as const).map((s) => <SelectItem key={s} value={s}>{SPORT_LABEL[s]}</SelectItem>)}</SelectContent></Select>
        <Select value={yr} onValueChange={setYr}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos</SelectItem>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>{["Data", "Atividade", "Tipo", "Distância", "Tempo", "Ritmo / vel.", "FC méd.", "Pot. NP", "TSS", "Zona", "Equipamento"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.slice(0, n).map((a) => (
              <tr key={a.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/30" onClick={() => nav(`/atividades/${a.id}`)}>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDatePt(a.date)}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SPORT_COLOR[a.sport] }} />{a.name}</div></td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{a.sessionType ? SESSION_LABEL[a.sessionType] : "–"}</td>
                <td className="num whitespace-nowrap px-3 py-2">{a.distanceM ? `${(a.distanceM / 1000).toFixed(a.sport === "swim" ? 2 : 1)} km` : "–"}</td>
                <td className="num px-3 py-2">{fmtDuration(a.durationS)}</td>
                <td className="num whitespace-nowrap px-3 py-2">{speed(a)}</td>
                <td className="num px-3 py-2">{a.avgHr ?? "–"}</td>
                <td className="num px-3 py-2">{a.normPower ?? "–"}</td>
                <td className="num px-3 py-2">{Math.round(activityTss(a, core.profile))}</td>
                <td className="px-3 py-2">Z{dominantZone(a, core.profile)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{a.gear ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {n < list.length && <div className="p-3 text-center"><Button variant="ghost" onClick={() => setN(n + PAGE)}>Mostrar mais</Button></div>}
      </Card>
    </div>
  );
}
