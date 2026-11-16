import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Flag, Pencil, Plus, Sparkles, Trash2, CheckCircle2, CircleDashed, XCircle, CircleDot, Clock, FileSpreadsheet, CalendarSync, Moon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { PageHeader, PHASE_COLOR } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, diffDays, fmtDatePt, fmtDuration, MONTHS_PT, month, startOfWeek, WEEKDAYS_PT, year } from "@/lib/dates";
import { phaseOn, weekTarget, nextRace as findNextRace, type PhaseSegment } from "@/lib/engine/periodization";
import { buildSteps, generateWeek, matchWeek, plannedTss, weekCompliance, type SessionMatch, type SessionStatus } from "@/lib/engine/plan";
import { downloadWorkoutFit, stepLines } from "@/lib/workout-format";
import { PHASE_LABEL, raceLabel, raceSportOf, SESSION_LABEL, SPORT_COLOR, SPORT_LABEL, type PlannedSession, type Race, type SessionType, type Sport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Dumbbell } from "lucide-react";
import { RoutineView, useFunctionalProfile } from "@/components/Functional";
import { buildRoutine, routineToSession, weekSuggestions, MODE_LABEL as FUNC_MODE_LABEL, type Routine } from "@/lib/engine/functional";
import { restDaysFor } from "@/lib/rest-days";
import { CoachImportDialog } from "@/components/CoachImport";
import { CalendarConnectDialog } from "@/components/CalendarConnect";
import { RaceSportDistance } from "@/components/RaceFields";

const fmtHms = (s?: number | null) => (s ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : "–");
const parseHms = (v: string) => { const p = v.split(":").map(Number); if (p.some(Number.isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 3600 + p[1] * 60 : null; };

export default function PlanPage() {
  const { core, derived } = useLoaded();
  const phase = phaseOn(derived.season, derived.today);
  const nextA = core.races.filter((r) => r.priority === "A" && r.date >= derived.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return (
    <div className="space-y-6">
      <PageHeader title="Época e plano" subtitle="Periodização a partir das provas A, plano semanal e cumprimento."
        actions={phase && <Badge className="px-3 py-1 text-xs" style={{ background: `color-mix(in srgb, ${PHASE_COLOR[phase.phase]} 18%, transparent)`, color: PHASE_COLOR[phase.phase] }}>Fase atual: {PHASE_LABEL[phase.phase]}{nextA ? ` · ${diffDays(derived.today, nextA.date)} dias para ${nextA.name}` : ""}</Badge>} />
      <SeasonTimeline />
      <WeekPlanner />
      <RacesCard />
    </div>
  );
}

// ───────────── Linha temporal da época ─────────────

function SeasonTimeline() {
  const { core, derived } = useLoaded();
  const nextA = core.races.filter((r) => r.priority === "A" && r.date >= derived.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const from = addDays(derived.today, -56);
  const to = nextA ? addDays(nextA.date, 35) : addDays(derived.today, 240);
  const span = diffDays(from, to) + 1;
  const pct = (d: string) => (Math.max(0, Math.min(span, diffDays(from, d))) / span) * 100;
  const segs = derived.season.filter((s) => s.to >= from && s.from <= to);
  const races = core.races.filter((r) => r.date >= from && r.date <= to);
  const months: string[] = [];
  for (let d = `${from.slice(0, 7)}-01`; d <= to; d = `${month(d) === 12 ? year(d) + 1 : year(d)}-${String((month(d) % 12) + 1).padStart(2, "0")}-01`) if (d >= from) months.push(d);
  const legend = [...new Set(segs.map((s) => s.phase))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Periodização</CardTitle>
        <CardDescription>{nextA ? `Construída para a prova A ${nextA.name} (${fmtDatePt(nextA.date)}). As provas B têm mini-taper; as C não alteram o plano.` : "Sem prova A marcada: toda a época fica em base. Adicione uma prova A abaixo."}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-2">
          <div className="relative min-w-[640px] pt-7">
            {/* provas */}
            {races.map((r) => (
              <div key={r.id} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pct(r.date)}%` }} title={`${r.name} · ${fmtDatePt(r.date)} · prova ${r.priority}`}>
                <Flag className={cn("mx-auto h-4 w-4", r.priority === "A" ? "text-warn" : "text-muted-foreground")} />
                <span className="num text-[10px] font-semibold">{r.priority}</span>
              </div>
            ))}
            {/* fases */}
            <div className="relative h-11 overflow-hidden rounded-lg bg-muted">
              {segs.map((s: PhaseSegment) => {
                const l = pct(s.from), w = Math.max(0.6, pct(addDays(s.to, 1)) - l);
                return (
                  <motion.div key={s.from + s.phase} initial={{ opacity: 0, scaleX: 0.9 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: 0.4 }}
                    className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-background/60 text-[11px] font-medium text-white"
                    style={{ left: `${l}%`, width: `${w}%`, background: PHASE_COLOR[s.phase], transformOrigin: "left" }} title={`${PHASE_LABEL[s.phase]} · ${fmtDatePt(s.from)} → ${fmtDatePt(s.to)}`}>
                    {w > 7 && <span className="truncate px-1 drop-shadow">{PHASE_LABEL[s.phase]}</span>}
                  </motion.div>
                );
              })}
              <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pct(derived.today)}%` }} title="Hoje" />
            </div>
            {/* meses */}
            <div className="relative mt-1 h-5">
              {months.map((m) => <span key={m} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${pct(m)}%` }}>{MONTHS_PT[month(m) - 1]}</span>)}
              <span className="absolute -translate-x-1/2 text-[10px] font-semibold text-foreground" style={{ left: `${pct(derived.today)}%`, top: 14 }}>hoje</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((p) => <span key={p} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PHASE_COLOR[p] }} />{PHASE_LABEL[p]}</span>)}
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────── Planeador semanal ─────────────

const STATUS: Record<SessionStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  done: { label: "Feito", icon: CheckCircle2, cls: "text-good" },
  partial: { label: "Parcial", icon: CircleDot, cls: "text-warn" },
  missed: { label: "Falhado", icon: XCircle, cls: "text-bad" },
  today: { label: "Hoje", icon: Clock, cls: "text-primary" },
  planned: { label: "Planeado", icon: CircleDashed, cls: "text-muted-foreground" },
};

function WeekPlanner() {
  const { core, derived, store, reload } = useLoaded();
  const [ws, setWs] = useState(startOfWeek(derived.today));
  const [edit, setEdit] = useState<PlannedSession | null>(null);
  const [confirmGen, setConfirmGen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const coach = core.profile.planSource === "coach";
  const we = addDays(ws, 6);
  const sessions = core.planned.filter((s) => s.date >= ws && s.date <= we);
  const acts = core.activities.filter((a) => a.date >= ws && a.date <= we);
  const { matches, unplanned } = useMemo(() => matchWeek(sessions, acts, derived.today), [sessions, acts, derived.today]);
  const comp = weekCompliance(matches, unplanned, core.profile);
  const ctl = (derived.load.find((l) => l.date === addDays(ws, -1)) ?? derived.load.at(-1)!).ctl;
  const target = weekTarget(derived.season, core.races, ws, ctl);
  const raceDates = core.races.filter((r) => r.date >= ws && r.date <= we).map((r) => r.date);
  const rest = restDaysFor(ws, core.profile, core.weekSettings);
  const fp = useFunctionalProfile();
  const funcWeek = useMemo(() => (fp.areas.length ? weekSuggestions(core.planned, core.races.map((r) => r.date), ws, 3, rest.days) : []), [core.planned, core.races, ws, fp.areas.length, rest.days.join()]);
  const [routine, setRoutine] = useState<Routine | null>(null);

  const generate = async () => {
    if (sessions.length && !confirmGen) { setConfirmGen(true); setTimeout(() => setConfirmGen(false), 4000); return; }
    setConfirmGen(false);
    await store.deletePlanned(sessions.map((s) => s.id));
    await store.savePlanned(generateWeek(target, core.profile, raceDates, rest.days));
    reload();
    toast.success(`Semana gerada: ${PHASE_LABEL[target.phase]}, ~${target.tss} TSS`);
  };
  const deleteWeek = async () => {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 4000); return; }
    setConfirmDel(false);
    await store.deletePlanned(sessions.map((s) => s.id));
    reload();
    toast.success(`Semana apagada (${sessions.length} sessões)`);
  };
  const toggleRest = async (d: number) => {
    const days = rest.days.includes(d) ? rest.days.filter((x) => x !== d) : [...rest.days, d].sort();
    await store.saveWeekRestDays(ws, days);
    reload();
  };
  const resetRest = async () => { await store.saveWeekRestDays(ws, null); reload(); };
  const save = async (s: PlannedSession) => { await store.savePlanned([s]); reload(); setEdit(null); toast.success("Sessão guardada"); };
  const remove = async (s: PlannedSession) => { await store.deletePlanned([s.id]); reload(); toast.success("Sessão removida"); };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Semana de {fmtDatePt(ws)}</CardTitle>
          <CardDescription>
            Fase <span style={{ color: PHASE_COLOR[target.phase] }} className="font-medium">{PHASE_LABEL[target.phase]}</span>
            {target.recoveryWeek && " · semana de descarga"}{target.bRace && ` · prova B (${target.bRace.name})`}
            {coach ? " · plano do treinador (a app não propõe treinos)" : ` · alvo ~${target.tss} TSS (~${target.hours} h), a partir da forma atual (CTL ${Math.round(ctl)})`}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWs(addDays(ws, -7))}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setWs(startOfWeek(derived.today))}>Esta semana</Button>
          <Button variant="outline" size="icon" aria-label="Semana seguinte" onClick={() => setWs(addDays(ws, 7))}><ChevronRight /></Button>
          {!coach && <Button variant={confirmGen ? "destructive" : "secondary"} size="sm" onClick={generate}><Sparkles />{confirmGen ? "Substituir semana?" : sessions.length ? "Regenerar" : "Gerar semana"}</Button>}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><FileSpreadsheet />Importar ficheiro</Button>
          <Button variant="outline" size="sm" onClick={() => setCalOpen(true)}><CalendarSync />Calendário</Button>
          {!!sessions.length && <Button variant={confirmDel ? "destructive" : "ghost"} size="sm" onClick={deleteWeek}><Trash2 />{confirmDel ? `Apagar ${sessions.length} sessões?` : "Apagar semana"}</Button>}
          <Button size="sm" onClick={() => setEdit(newSession(ws, core.profile))}><Plus />Sessão</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Moon className="h-3.5 w-3.5" />Dias de descanso desta semana:</span>
          {WEEKDAYS_PT.map((w, k) => (
            <button key={w} type="button" aria-pressed={rest.days.includes(k)} onClick={() => toggleRest(k)}
              className={cn("rounded-full border px-2.5 py-1 transition-colors", rest.days.includes(k) ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>{w}</button>
          ))}
          <span className="text-muted-foreground">{rest.custom ? "(só esta semana)" : rest.days.length ? "(habituais, do perfil)" : "(a app escolhe)"}</span>
          {rest.custom && <button className="flex items-center gap-1 text-primary hover:underline" onClick={resetRest}><RotateCcw className="h-3 w-3" />Repor habituais</button>}
          {!!rest.days.length && <span className="w-full text-[11px] text-muted-foreground">O treino funcional só é sugerido nestes dias{!coach && "; ao gerar a semana, a app não põe treinos aqui"}.</span>}
        </div>
        <ComplianceStrip comp={comp} />
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
            const day = matches.filter((m) => m.session.date === d);
            const extra = unplanned.filter((a) => a.date === d);
            const race = core.races.find((r) => r.date === d);
            return (
              <div key={d} className={cn("min-w-0 rounded-lg border p-2.5", rest.days.includes(i(d, ws)) && "border-dashed bg-muted/30", d === derived.today && "border-primary/60 bg-primary/5")}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="flex items-center gap-1 text-xs font-semibold">{WEEKDAYS_PT[i(d, ws)]}{rest.days.includes(i(d, ws)) && <Moon className="h-3 w-3 text-muted-foreground" aria-label="Dia de descanso" />}</span>
                  <span className="num text-[11px] text-muted-foreground">{Number(d.slice(8))} {MONTHS_PT[month(d) - 1]}</span>
                </div>
                {race && <div className="mb-2 flex items-center gap-1.5 rounded-md bg-warn/15 px-2 py-1 text-[11px] font-medium text-warn"><Flag className="h-3 w-3" />{race.name} ({race.priority})</div>}
                <div className="space-y-2">
                  {day.map((m) => <SessionCard key={m.session.id} m={m} onEdit={() => setEdit(m.session)} onDelete={() => remove(m.session)} />)}
                  {extra.map((a) => (
                    <Link key={a.id} to={`/atividades/${a.id}`} className="block rounded-md border border-dashed p-2 text-[11px] hover:bg-muted">
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SPORT_COLOR[a.sport] }} /><span className="truncate">{a.name}</span></div>
                      <div className="text-muted-foreground">Não planeado · {fmtDuration(a.durationS)}</div>
                    </Link>
                  ))}
                  {(() => {
                    const fs = funcWeek.find((x) => x.date === d);
                    const hasFunc = day.some((m) => m.session.type === "functional");
                    if (!fs?.mode || hasFunc) return null;
                    const r = buildRoutine(fp, d, fs.mode, { avoidHeavy: fs.avoidHeavy });
                    return (
                      <button onClick={() => setRoutine(r)} className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 p-2 text-left text-[11px] text-primary hover:bg-primary/10">
                        <Dumbbell className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Funcional · {r.minutes} min</span>
                      </button>
                    );
                  })()}
                  {!day.length && !extra.length && !race && <div className="py-2 text-center text-[11px] text-muted-foreground">Descanso</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      {edit && <SessionDialog key={edit.id || "new"} session={edit} onClose={() => setEdit(null)} onSave={save} />}
      <CoachImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <CalendarConnectDialog open={calOpen} onClose={() => setCalOpen(false)} />
      {routine && (
        <Dialog open onOpenChange={(o) => !o && setRoutine(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{FUNC_MODE_LABEL[routine.mode]} · {fmtDatePt(routine.date)}</DialogTitle>
              <DialogDescription>{routine.minutes} min · sugerida para este dia{routine.note ? `. ${routine.note}` : ""}</DialogDescription>
            </DialogHeader>
            <RoutineView r={routine} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => downloadWorkoutFit(routineToSession(routine))}><Download />FIT</Button>
              <Button onClick={async () => { await store.savePlanned([routineToSession(routine)]); reload(); setRoutine(null); toast.success("Rotina funcional adicionada ao plano"); }}><Plus />Adicionar ao plano</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

const i = (d: string, ws: string) => diffDays(ws, d);

function newSession(ws: string, p: any): PlannedSession {
  return { id: "", date: ws, sport: "run", type: "endurance", durationMin: 60, tss: plannedTss("run", "endurance", 60), title: "Corrida · Aeróbio", description: "", steps: buildSteps("run", "endurance", 60, p), source: "manual" };
}

function ComplianceStrip({ comp }: { comp: ReturnType<typeof weekCompliance> }) {
  const items: [string, string, string?][] = [
    ["Sessões cumpridas", comp.sessionsDue ? `${comp.sessionsDone}/${comp.sessionsDue}` : "–"],
    ["Volume cumprido", comp.volumePct == null ? "–" : `${comp.volumePct}%`, comp.volumePct == null ? undefined : comp.volumePct >= 85 ? "text-good" : comp.volumePct >= 65 ? "text-warn" : "text-bad"],
    ["Tempo", `${fmtDuration(comp.actualMin * 60)} / ${fmtDuration(comp.plannedMin * 60)}`],
    ["Carga", `${comp.actualTss} / ${comp.plannedTss} TSS`],
  ];
  const sports = (["swim", "bike", "run"] as Sport[]).filter((s) => comp.bySport[s]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([l, v, cls]) => (
          <div key={l} className="rounded-lg bg-muted/50 p-3">
            <div className="text-[11px] text-muted-foreground">{l}</div>
            <div className={cn("num text-base font-semibold leading-tight", cls)}>{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {sports.map((s) => {
          const b = comp.bySport[s]!;
          const max = Math.max(b.planned, b.actual, 1);
          return (
            <div key={s} className="grid grid-cols-[72px_1fr_88px] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{SPORT_LABEL[s]}</span>
              <div className="relative h-3 rounded-full bg-muted">
                <div className="absolute inset-y-0 rounded-full border-2 border-dashed" style={{ width: `${(b.planned / max) * 100}%`, borderColor: SPORT_COLOR[s] }} />
                <div className="absolute inset-y-0.5 left-0.5 rounded-full" style={{ width: `calc(${(b.actual / max) * 100}% - 4px)`, background: SPORT_COLOR[s] }} />
              </div>
              <span className="num text-right">{fmtDuration(b.actual * 60)} / {fmtDuration(b.planned * 60)}</span>
            </div>
          );
        })}
        {!!sports.length && <p className="text-[10px] text-muted-foreground">Contorno: planeado · preenchido: realizado</p>}
      </div>
    </div>
  );
}

function SessionCard({ m, onEdit, onDelete }: { m: SessionMatch; onEdit: () => void; onDelete: () => void }) {
  const st = STATUS[m.status];
  const Icon = st.icon;
  const s = m.session;
  return (
    <div className="group rounded-md border bg-background/60 p-2 text-[11px]" style={{ borderLeft: `3px solid ${SPORT_COLOR[s.sport]}` }}>
      <div className="flex items-start gap-1.5">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", st.cls)} aria-label={st.label} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={s.description ? `${s.title}\n${s.description}` : s.title}>{s.source === "coach" || s.source === "calendar" ? s.title.replace(/^[^·]+·\s*/, "") || SESSION_LABEL[s.type] : SESSION_LABEL[s.type]}</div>
          {(s.source === "coach" || s.source === "calendar") && <div className="text-[10px] font-medium text-secondary">{s.source === "coach" ? "Treinador" : "Calendário"}</div>}
          <div className="text-muted-foreground">{SPORT_LABEL[s.sport]} · {s.durationMin} min · {s.tss ?? plannedTss(s.sport, s.type, s.durationMin)} TSS</div>
          {m.activity && (
            <Link to={`/atividades/${m.activity.id}`} className={cn("mt-1 block truncate hover:underline", st.cls)}>
              {fmtDuration(m.activity.durationS)} feitos{m.ratio != null && ` (${Math.round(m.ratio * 100)}%)`}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
        <button className="rounded p-1 hover:bg-muted" title="Exportar treino FIT" aria-label="Exportar treino FIT" onClick={() => { downloadWorkoutFit(s); toast.success("Treino FIT descarregado. Importe-o no Garmin Connect → Treinos."); }}><Download className="h-3.5 w-3.5" /></button>
        <button className="rounded p-1 hover:bg-muted" title="Editar" aria-label="Editar sessão" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></button>
        <button className="rounded p-1 hover:bg-muted" title="Remover" aria-label="Remover sessão" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

const SPORT_OPTS: Sport[] = ["swim", "bike", "run", "strength", "brick"];
const TYPE_OPTS: SessionType[] = ["recovery", "technique", "endurance", "long", "tempo", "intervals", "race"];

function SessionDialog({ session, onClose, onSave }: { session: PlannedSession | null; onClose: () => void; onSave: (s: PlannedSession) => void }) {
  const { core } = useLoaded();
  const [s, setS] = useState<PlannedSession | null>(session);
  const [touchedSteps, setTouched] = useState(session?.source === "coach" || session?.source === "calendar");
  if (!session || !s) return null;
  const set = (patch: Partial<PlannedSession>) => {
    const n = { ...s, ...patch };
    if ("sport" in patch || "type" in patch || "durationMin" in patch) {
      n.steps = buildSteps(n.sport, n.type, n.durationMin, core.profile);
      n.tss = plannedTss(n.sport, n.type, n.durationMin);
      if (!touchedSteps) n.title = `${SPORT_LABEL[n.sport]} · ${SESSION_LABEL[n.type]}`;
    }
    setS(n);
  };
  const lines = stepLines(s.steps, s.sport);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session.id ? "Editar sessão" : "Nova sessão"}</DialogTitle>
          <DialogDescription>Os passos e os alvos são calculados a partir do seu FTP, limiar de corrida e CSS.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Data</Label><Input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Duração (min)</Label><Input type="number" min={10} max={600} value={s.durationMin} onChange={(e) => set({ durationMin: Math.max(10, Number(e.target.value) || 10) })} /></div>
          <div className="space-y-1">
            <Label>Modalidade</Label>
            <Select value={s.sport} onValueChange={(v) => set({ sport: v as Sport })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPORT_OPTS.map((x) => <SelectItem key={x} value={x}>{SPORT_LABEL[x]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={s.type} onValueChange={(v) => set({ type: v as SessionType })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPE_OPTS.map((x) => <SelectItem key={x} value={x}>{SESSION_LABEL[x]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="col-span-2 space-y-1"><Label>Título</Label><Input value={s.title} onChange={(e) => { setTouched(true); setS({ ...s, title: e.target.value }); }} /></div>
          <div className="col-span-2 space-y-1"><Label>Notas</Label><Input value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between text-xs"><span className="font-medium">Estrutura</span><span className="num text-muted-foreground">{s.tss} TSS estimado</span></div>
          <ol className="space-y-1 text-xs">
            {lines.map((l, k) => (
              <li key={k}>
                {l.children ? (<><span className="font-semibold">{l.text}</span><ul className="ml-4 list-disc text-muted-foreground">{l.children.map((c, j) => <li key={j}>{c}</li>)}</ul></>) : <span>{l.text}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => downloadWorkoutFit(s)}><Download />Exportar FIT</Button>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(s)}>Guardar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Provas ─────────────

function RacesCard() {
  const { core, derived, store, reload } = useLoaded();
  const [edit, setEdit] = useState<Race | null>(null);
  const upcoming = core.races.filter((r) => r.date >= derived.today);
  const past = core.races.filter((r) => r.date < derived.today).reverse();
  const next = findNextRace(core.races, derived.today);
  const row = (r: Race) => (
    <tr key={r.id} className="border-b border-border/50">
      <td className="num whitespace-nowrap py-2 pr-3 text-muted-foreground">{fmtDatePt(r.date)}</td>
      <td className="py-2 pr-3"><div className="flex items-center gap-2">{r.id === next?.id && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}<span className="font-medium">{r.name}</span></div></td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{raceLabel(r)}</td>
      <td className="py-2 pr-3"><Badge variant={r.priority === "A" ? "warn" : "outline"}>{r.priority}</Badge></td>
      <td className="num py-2 pr-3">{fmtHms(r.goalTimeS)}</td>
      <td className={cn("num py-2 pr-3", r.resultTimeS && r.goalTimeS && (r.resultTimeS <= r.goalTimeS ? "text-good" : "text-bad"))}>{fmtHms(r.resultTimeS)}</td>
      <td className="py-2 text-right">
        <button className="rounded p-1 hover:bg-muted" aria-label="Editar prova" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>
        <button className="rounded p-1 hover:bg-muted" aria-label="Apagar prova" onClick={async () => { await store.deleteRace(r.id); reload(); }}><Trash2 className="h-3.5 w-3.5" /></button>
      </td>
    </tr>
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5"><CardTitle>Provas</CardTitle><CardDescription>A: objetivo da época (periodização completa) · B: mini-taper · C: treino de qualidade.</CardDescription></div>
        <Button size="sm" onClick={() => setEdit({ id: "", date: addDays(derived.today, 90), name: "", sport: "triathlon", distance: "olympic", priority: "B" })}><Plus />Prova</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr>{["Data", "Prova", "Desporto · distância", "Prior.", "Objetivo", "Resultado", ""].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {upcoming.map(row)}
            {!!past.length && <tr><td colSpan={7} className="pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anteriores</td></tr>}
            {past.slice(0, 8).map(row)}
          </tbody>
        </table>
      </CardContent>
      {edit && <RaceDialog race={edit} onClose={() => setEdit(null)} onSave={async (r) => { await store.saveRace(r); reload(); setEdit(null); toast.success("Prova guardada · periodização atualizada"); }} />}
    </Card>
  );
}

function RaceDialog({ race, onClose, onSave }: { race: Race; onClose: () => void; onSave: (r: Race) => void }) {
  const [r, setR] = useState<Race>({ ...race, sport: raceSportOf(race) });
  const [goal, setGoal] = useState(race.goalTimeS ? fmtHms(race.goalTimeS) : "");
  const [result, setResult] = useState(race.resultTimeS ? fmtHms(race.resultTimeS) : "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{race.id ? "Editar prova" : "Nova prova"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Nome</Label><Input autoFocus value={r.name} placeholder="Ex.: Meia Maratona de Lisboa" onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Data</Label><Input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={r.priority} onValueChange={(v) => setR({ ...r, priority: v as Race["priority"] })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="A">A · objetivo</SelectItem><SelectItem value="B">B · importante</SelectItem><SelectItem value="C">C · treino</SelectItem></SelectContent></Select>
          </div>
          <RaceSportDistance sport={r.sport ?? "triathlon"} distance={r.distance} onChange={(v) => setR({ ...r, ...v })} />
          <div className="space-y-1"><Label>Local</Label><Input value={r.location ?? ""} onChange={(e) => setR({ ...r, location: e.target.value })} /></div>
          <div className="space-y-1"><Label>Objetivo (h:mm:ss)</Label><Input value={goal} placeholder="4:55:00" onChange={(e) => setGoal(e.target.value)} /></div>
          <div className="space-y-1"><Label>Resultado (h:mm:ss)</Label><Input value={result} placeholder="–" onChange={(e) => setResult(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!r.name.trim() || !r.date} onClick={() => onSave({ ...r, name: r.name.trim(), goalTimeS: goal ? parseHms(goal) : null, resultTimeS: result ? parseHms(result) : null })}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
