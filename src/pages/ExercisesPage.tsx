import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader, Empty } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExerciseFigure } from "@/components/figures/ExerciseFigure";
import { AREAS, AREA_LABEL, EQUIPMENT, EXERCISES, LEVEL_LABEL, type ExerciseKind, type FunctionalArea, type FunctionalLevel } from "@/lib/engine/functional";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ExerciseKind, string> = { mobility: "Mobilidade", activation: "Ativação", strength: "Força", heavy: "Excêntrico", iso: "Isometria" };
const EQUIP_LABEL = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.label]));

export default function ExercisesPage() {
  const { core } = useLoaded();
  const level = (core.profile.functionalLevel ?? "intermediate") as FunctionalLevel;
  const mine = (core.profile.functionalAreas ?? []) as FunctionalArea[];
  const [area, setArea] = useState<FunctionalArea | "mine" | "all">(mine.length ? "mine" : "all");
  const [q, setQ] = useState("");
  const list = useMemo(() => EXERCISES.filter((e) =>
    (area === "all" || (area === "mine" ? e.areas.some((a) => mine.includes(a)) : e.areas.includes(area))) &&
    (!q || (e.name + e.cues).toLowerCase().includes(q.toLowerCase()))), [area, q, mine]);

  const chip = (id: typeof area, label: string) => (
    <button key={id} onClick={() => setArea(id)} aria-pressed={area === id}
      className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", area === id ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>{label}</button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Exercícios" subtitle={`${EXERCISES.length} exercícios de força, ativação e mobilidade para triatletas. Doses para o seu nível (${LEVEL_LABEL[level].toLowerCase()}).`} />
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar exercício" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {mine.length > 0 && chip("mine", "As minhas zonas")}
          {chip("all", "Todos")}
          {AREAS.map((a) => chip(a.id, a.label))}
        </div>
      </div>
      {list.length === 0 ? <Empty>Nenhum exercício encontrado.</Empty> : (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((e) => (
            <Card key={e.id} id={e.id} className="overflow-hidden">
              <div className="border-b bg-muted/20 p-3"><ExerciseFigure id={e.id} /></div>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug">{e.name}</h3>
                  <span className="num shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{e.dose[level] === "—" ? e.dose.intermediate : e.dose[level]}</span>
                </div>
                <p className="text-sm text-muted-foreground">{e.cues}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="default">{KIND_LABEL[e.kind]}</Badge>
                  {e.areas.map((a) => <Badge key={a} variant="outline">{AREA_LABEL[a]}</Badge>)}
                  {e.equipment.map((q) => <Badge key={q} variant="outline">{EQUIP_LABEL[q]}</Badge>)}
                  {e.level !== "beginner" && <Badge variant="warn">{LEVEL_LABEL[e.level]}+</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
