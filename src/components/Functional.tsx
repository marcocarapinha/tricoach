import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarPlus, Check, ChevronDown, Download, Dumbbell, Info, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AREA_LABEL, MODE_LABEL, buildRoutine, recentCount, routineToSession, weekSuggestions, type DaySuggestion, type FunctionalArea, type FunctionalProfile, type Routine, type RoutineMode } from "@/lib/engine/functional";
import { downloadWorkoutFit } from "@/lib/workout-format";
import { ExerciseFigure } from "@/components/figures/ExerciseFigure";
import { addDays, startOfWeek, WEEKDAYS_PT } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function useFunctionalProfile(): FunctionalProfile {
  const { core } = useLoaded();
  const p = core.profile;
  return { areas: (p.functionalAreas ?? []) as FunctionalArea[], level: p.functionalLevel ?? "intermediate", equipment: (p.functionalEquipment ?? []) as FunctionalProfile["equipment"] };
}

/** Sugestões da semana que contém `date`. */
export function useWeekFunctional(date: string): DaySuggestion[] {
  const { core } = useLoaded();
  const ws = startOfWeek(date);
  return useMemo(() => weekSuggestions(core.planned, core.races.map((r) => r.date), ws), [core.planned, core.races, ws]);
}

/** Lista de exercícios de uma rotina, com instruções expansíveis. */
export function RoutineView({ r, dense }: { r: Routine; dense?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="space-y-1.5">
      {r.items.map((it, i) => (
        <li key={it.exercise.id} className="rounded-lg border bg-background/50">
          <button className="flex w-full items-center gap-3 p-2.5 text-left" onClick={() => setOpen(open === it.exercise.id ? null : it.exercise.id)} aria-expanded={open === it.exercise.id}>
            <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{it.exercise.name}</span>
              {!dense && <span className="text-[11px] text-muted-foreground">{it.area === "warmup" ? "Aquecimento / mobilidade" : it.area === "core" ? "Core" : AREA_LABEL[it.area]}</span>}
            </span>
            <span className="num shrink-0 text-xs font-medium">{it.dose}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === it.exercise.id && "rotate-180")} />
          </button>
          {open === it.exercise.id && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2 px-3 pb-3 sm:px-11">
              <ExerciseFigure id={it.exercise.id} className="max-w-md" />
              <p className="text-xs text-muted-foreground">{it.exercise.cues}</p>
            </motion.div>
          )}
        </li>
      ))}
      {!dense && <li className="px-1 pt-1 text-[11px] text-muted-foreground">Pare se sentir dor. Confirme os exercícios e as cargas com um fisioterapeuta ou treinador, sobretudo se tiver uma lesão.</li>}
    </ol>
  );
}

/** Cartão da página Hoje: rotina funcional do dia, encaixada no plano e na prontidão. */
export function FunctionalCard({ className }: { className?: string }) {
  const { core, derived, store, reload } = useLoaded();
  const fp = useFunctionalProfile();
  const week = useWeekFunctional(derived.today);
  const ws = startOfWeek(derived.today);
  const todaySug = week.find((d) => d.date === derived.today)!;
  const red = derived.readiness.level === "red";
  const [override, setOverride] = useState<RoutineMode | null>(null);
  const baseMode: RoutineMode | null = todaySug.mode ? (red ? "mobility" : todaySug.mode) : null;
  const mode = override ?? baseMode;
  const routine = mode ? buildRoutine(fp, derived.today, mode, { avoidHeavy: todaySug.avoidHeavy || derived.readiness.level === "amber" }) : null;
  const done = core.functionalLog.find((l) => l.date === derived.today);
  const weekDone = core.functionalLog.filter((l) => l.date >= ws && l.date <= addDays(ws, 6)).length;
  const weekTarget = week.filter((d) => d.mode).length;
  const nextWeek = useWeekFunctional(addDays(ws, 7));
  const next = [...week, ...nextWeek].find((d) => d.date > derived.today && d.mode);
  const planned = core.planned.some((s) => s.date === derived.today && s.type === "functional");

  if (!fp.areas.length) {
    return (
      <Card className={className}>
        <CardHeader><CardTitle className="flex items-center gap-2"><Dumbbell className="h-4 w-4" />Treino funcional</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Indique as suas zonas problemáticas (Aquiles, posterior da coxa, joelho…) e a app sugere rotinas de força e mobilidade para os dias de descanso.</p>
          <Button asChild variant="outline"><Link to="/definicoes">Configurar no perfil</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const markDone = async () => {
    if (!routine) return;
    await store.saveFunctionalLog({ date: derived.today, mode: routine.mode, minutes: routine.minutes, exercises: routine.items.map((i) => i.exercise.id), areas: routine.areas });
    reload(); toast.success("Rotina funcional registada");
  };

  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2"><Dumbbell className="h-4 w-4" />Treino funcional</CardTitle>
          <CardDescription>Foco: {fp.areas.map((a) => AREA_LABEL[a]).join(" · ")}</CardDescription>
        </div>
        <WeekDots week={week} done={core.functionalLog.map((l) => l.date)} today={derived.today} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {mode ? <Badge variant={mode === "full" ? "default" : "outline"}>{MODE_LABEL[mode]} · {routine!.minutes} min</Badge> : <Badge variant="outline">Hoje sem rotina</Badge>}
          <span className="text-muted-foreground">
            {red && todaySug.mode && !override ? "Prontidão baixa: hoje só mobilidade." : todaySug.reason}
            {!todaySug.mode && next && ` Próxima rotina: ${["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"][(new Date(next.date + "T00:00:00Z").getUTCDay() + 6) % 7]}${next.date > addDays(ws, 6) ? " da próxima semana" : ""} (${MODE_LABEL[next.mode!].toLowerCase()}).`}
            {!todaySug.mode && override && (override === "mobility" ? " Mobilidade opcional." : " Rotina opcional.")}
          </span>
          <span className="num ml-auto text-xs text-muted-foreground">Esta semana: {weekDone} {weekDone === 1 ? "feita" : "feitas"} · {weekTarget} {weekTarget === 1 ? "sugerida" : "sugeridas"}</span>
        </div>

        {routine ? (
          <>
            {routine.note && <div className="flex gap-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{routine.note}</div>}
            <RoutineView r={routine} />
            <div className="flex flex-wrap gap-2">
              {done ? (
                <Button variant="secondary" onClick={async () => { await store.deleteFunctionalLog(derived.today); reload(); }}><Undo2 />Feita · desfazer</Button>
              ) : <Button onClick={markDone}><Check />Marcar como feita</Button>}
              {!planned && <Button variant="outline" onClick={async () => { await store.savePlanned([routineToSession(routine)]); reload(); toast.success("Adicionada ao plano de hoje"); }}><CalendarPlus />Adicionar ao plano</Button>}
              <Button variant="outline" onClick={() => { downloadWorkoutFit(routineToSession(routine)); toast.success("Rotina descarregada em FIT"); }}><Download />FIT</Button>
              {override && <Button variant="ghost" onClick={() => setOverride(null)}><RotateCcw />Repor sugestão</Button>}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOverride("mobility")}>Fazer só mobilidade (~10 min)</Button>
            <Button variant="ghost" onClick={() => setOverride("short")}>Rotina curta mesmo assim</Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Dor até 3/10 durante o exercício é aceitável. Se a dor passar de 5/10 ou piorar no dia seguinte, reduza a carga e fale com um fisioterapeuta.</p>
      </CardContent>
    </Card>
  );
}

function WeekDots({ week, done, today }: { week: DaySuggestion[]; done: string[]; today: string }) {
  return (
    <div className="flex gap-1" aria-label="Rotinas funcionais desta semana">
      {week.map((d, i) => {
        const isDone = done.includes(d.date);
        return (
          <div key={d.date} className="flex w-7 flex-col items-center gap-1" title={`${WEEKDAYS_PT[i]}: ${d.mode ? MODE_LABEL[d.mode] : d.reason}${isDone ? " · feita" : ""}`}>
            <span className={cn("text-[10px]", d.date === today ? "font-semibold text-foreground" : "text-muted-foreground")}>{WEEKDAYS_PT[i]}</span>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[9px]",
              isDone ? "border-good bg-good text-white" : d.mode === "full" ? "border-primary bg-primary/20" : d.mode === "short" ? "border-primary/50 border-dashed" : "border-border bg-muted/40")}>
              {isDone ? "✓" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
