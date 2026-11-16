import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, Check, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scale5, Empty } from "@/components/common";
import { matchWeek } from "@/lib/engine/plan";
import { downloadWorkoutFit, stepLines } from "@/lib/workout-format";
import { SESSION_LABEL, SPORT_COLOR, SPORT_LABEL, type CheckIn } from "@/lib/types";
import { fmtDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Check-in subjetivo da manhã (10 segundos). Entra no índice de prontidão como "Sensações". */
export function CheckinCard({ className }: { className?: string }) {
  const { derived, store, reload } = useLoaded();
  const existing = derived.checkinByDate.get(derived.today);
  const [editing, setEditing] = useState(!existing);
  const [c, setC] = useState<CheckIn>(existing ?? { date: derived.today, energy: 3, soreness: 2, mood: 3, motivation: 3, notes: "" });
  const save = async () => { await store.saveCheckin(c); reload(); setEditing(false); toast.success("Check-in guardado · prontidão atualizada"); };
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5"><CardTitle>Como se sente hoje?</CardTitle><CardDescription>Check-in rápido · conta para a prontidão</CardDescription></div>
        {!editing && <Button variant="ghost" size="icon" aria-label="Editar check-in" onClick={() => setEditing(true)}><Pencil /></Button>}
      </CardHeader>
      <CardContent>
        {editing ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {([["energy", "Energia", "sem energia", "cheio de energia"], ["soreness", "Dores musculares", "nenhuma", "muitas"], ["mood", "Humor", "em baixo", "ótimo"], ["motivation", "Motivação para treinar", "nenhuma", "muita"]] as const).map(([k, l, lo, hi]) => (
              <div key={k} className="space-y-1.5"><div className="text-xs font-medium">{l}</div><Scale5 value={c[k]} onChange={(v) => setC({ ...c, [k]: v })} low={lo} high={hi} /></div>
            ))}
            <Input placeholder="Notas (opcional): dormi mal, garganta irritada…" value={c.notes ?? ""} onChange={(e) => setC({ ...c, notes: e.target.value })} />
            <Button className="w-full" onClick={save}><Check />Guardar check-in</Button>
          </motion.div>
        ) : existing && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["Energia", existing.energy, false], ["Dores", existing.soreness, true], ["Humor", existing.mood, false], ["Motivação", existing.motivation, false]] as const).map(([l, v, inv]) => (
              <div key={l} className="rounded-lg bg-muted/50 p-2">
                <div className="text-[10px] text-muted-foreground">{l}</div>
                <div className={cn("num text-xl font-semibold", (inv ? v >= 4 : v <= 2) ? "text-warn" : "")}>{v}<span className="text-xs text-muted-foreground">/5</span></div>
              </div>
            ))}
            {existing.notes && <p className="col-span-4 text-left text-xs text-muted-foreground">“{existing.notes}”</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Sessões planeadas para hoje, com estado e exportação FIT. */
export function TodayPlanned({ compact }: { compact?: boolean }) {
  const { core, derived } = useLoaded();
  const today = core.planned.filter((s) => s.date === derived.today);
  const { matches } = matchWeek(today, core.activities.filter((a) => a.date === derived.today), derived.today);
  if (!today.length) return <Empty><span className="flex flex-col items-center gap-2">Nada planeado para hoje.<Link to="/plano" className="text-primary hover:underline">Abrir o plano</Link></span></Empty>;
  const r = derived.readiness;
  const heavy = today.some((s) => s.type === "intervals" || s.type === "tempo" || s.type === "long" || s.durationMin > 75);
  return (
    <div className="space-y-3">
      {heavy && (r.level === "red" || r.level === "amber") && (
        <div className={cn("rounded-md border p-2 text-xs", r.level === "red" ? "border-bad/40 bg-bad/10 text-bad" : "border-warn/40 bg-warn/10 text-warn")}>
          Prontidão {r.score}: {r.level === "red" ? "troque esta sessão por descanso ou 30–40 min muito fáceis." : "reduza a intensidade e encurte a sessão."}
        </div>
      )}
      {matches.map(({ session: s, activity, status }) => (
        <div key={s.id} className="rounded-lg border p-3" style={{ borderLeft: `3px solid ${SPORT_COLOR[s.sport]}` }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{SPORT_LABEL[s.sport]} · {SESSION_LABEL[s.type]}</div>
              <div className="text-xs text-muted-foreground">{s.durationMin} min · {s.tss} TSS{status === "done" && activity ? ` · feito (${fmtDuration(activity.durationS)})` : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { downloadWorkoutFit(s); toast.success("Treino FIT descarregado"); }}><Download />FIT</Button>
          </div>
          {!compact && (
            <ol className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {stepLines(s.steps, s.sport).map((l, i) => <li key={i}>{l.children ? <><span className="font-medium text-foreground">{l.text}</span> {l.children.join(" | ")}</> : l.text}</li>)}
            </ol>
          )}
        </div>
      ))}
      {!compact && <Link to="/plano" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><CalendarDays className="h-3.5 w-3.5" />Ver a semana</Link>}
    </div>
  );
}
