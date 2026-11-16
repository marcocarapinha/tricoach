import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Bell, Bike, CalendarRange, Check, CheckCircle2, Download, Dumbbell, HeartPulse, HelpCircle,
  ClipboardList, KeyRound, Loader2, ShieldAlert, Sparkles, User, Waves, Footprints,
} from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { AREAS, EQUIPMENT, LEVEL_LABEL, MAX_AREAS } from "@/lib/engine/functional";
import { enablePush, pushSupported } from "@/lib/push";
import { useInstall } from "@/lib/install";
import { MONTHS_PT, WEEKDAYS_PT, addDays, todayISO } from "@/lib/dates";
import {
  cssFromTests, fmtMmSs, ftpFrom20min, ftpFromLevel, hrMaxFromAge, lthrFromHrMax, parseMmSs, thresholdPaceFrom10k,
} from "@/lib/onboarding";
import { type AthleteProfile, type RaceSport } from "@/lib/types";
import { RaceSportDistance } from "@/components/RaceFields";
import { Logo } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstallAppButton } from "@/components/AppActions";
import { DisclaimerText } from "@/components/Disclaimer";
import { PlanSourcePicker, RestDaysPicker } from "@/components/PlanPrefs";
import { cn } from "@/lib/utils";

type StepId = "welcome" | "about" | "heart" | "bike" | "run" | "swim" | "season" | "plan" | "functional" | "garmin" | "notify" | "done";
const STEP_META: Record<StepId, { title: string; icon: typeof User }> = {
  welcome: { title: "Bem-vindo", icon: Sparkles },
  about: { title: "Sobre si", icon: User },
  heart: { title: "Frequência cardíaca", icon: HeartPulse },
  bike: { title: "Ciclismo", icon: Bike },
  run: { title: "Corrida", icon: Footprints },
  swim: { title: "Natação", icon: Waves },
  season: { title: "Época e prova", icon: CalendarRange },
  plan: { title: "Plano e descanso", icon: ClipboardList },
  functional: { title: "Treino funcional", icon: Dumbbell },
  garmin: { title: "Garmin", icon: KeyRound },
  notify: { title: "Notificações", icon: Bell },
  done: { title: "Resumo", icon: CheckCircle2 },
};

/** Caixa "Porquê / como saber" que abre e fecha. */
function Help({ title = "Como sei este valor?", children }: { title?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-muted/30 p-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-primary">
        <HelpCircle className="h-4 w-4" />{title}
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </details>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">{children}</p>;
}

function Field({ label, suffix, children, hint }: { label: string; suffix?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="relative">{children}{suffix && <span className="pointer-events-none absolute right-3 top-2 text-xs text-muted-foreground">{suffix}</span>}</div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const num = (v: string) => (v === "" ? NaN : Number(v));

/** Assistente de configuração inicial, passo a passo. Também pode ser repetido a partir das Definições. */
export default function OnboardingPage({ onLater }: { onLater?: () => void }) {
  const { core, store, reload } = useLoaded();
  const navigate = useNavigate();
  const [p, setP] = useState<AthleteProfile>({ ...core.profile, name: core.profile.name === "Atleta" ? "" : core.profile.name });
  const set = (patch: Partial<AthleteProfile>) => setP((x) => ({ ...x, ...patch }));
  const steps = useMemo<StepId[]>(() => ["welcome", "about", "heart", "bike", "run", "swim", "season", "plan", "functional", ...(store.mode === "supabase" ? ["garmin" as const] : []), "notify", "done"], [store.mode]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const step = steps[i];

  // campos auxiliares (só para estimar)
  const [age, setAge] = useState("");
  const [p20, setP20] = useState("");
  const [t10k, setT10k] = useState("");
  const [paceText, setPaceText] = useState(fmtMmSs(core.profile.runThresholdPace));
  const [cssText, setCssText] = useState(fmtMmSs(core.profile.css));
  const [t400, setT400] = useState("");
  const [t200, setT200] = useState("");
  const [race, setRace] = useState({ name: "", date: "", sport: "triathlon" as RaceSport, distance: "olympic" });
  const [raceSaved, setRaceSaved] = useState(false);
  const [gKey, setGKey] = useState("");
  const [gExp, setGExp] = useState("");
  const [gState, setGState] = useState<"idle" | "busy" | "ok">("idle");
  const [pushBusy, setPushBusy] = useState(false);
  const [ack, setAck] = useState(!!core.profile.onboardedAt);

  const persist = async (patch: Partial<AthleteProfile> = {}) => {
    const next = { ...p, ...patch, name: (patch.name ?? p.name).trim() || "Atleta" };
    await store.saveProfile(next);
    return next;
  };

  const go = async (delta: number) => {
    if (delta > 0 && step !== "welcome") {
      setSaving(true);
      try {
        // passos com campos de texto: confirmar o valor antes de avançar
        if (step === "run") {
          const v = parseMmSs(paceText);
          if (!v || v < 150 || v > 600) { toast.error("Indique o ritmo em minutos:segundos por km, por exemplo 4:45."); return; }
          set({ runThresholdPace: v }); await persist({ runThresholdPace: v });
        } else if (step === "swim") {
          const v = parseMmSs(cssText);
          if (!v || v < 55 || v > 240) { toast.error("Indique o CSS em minutos:segundos por 100 m, por exemplo 1:45."); return; }
          set({ css: v }); await persist({ css: v });
        } else if (step === "season" && race.name && race.date && !raceSaved) {
          await store.saveRace({ id: "", name: race.name.trim(), date: race.date, sport: race.sport, distance: race.distance, priority: "A" });
          setRaceSaved(true);
          await persist();
        } else await persist();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e)); return;
      } finally { setSaving(false); }
    }
    setDir(delta);
    setI((x) => Math.min(steps.length - 1, Math.max(0, x + delta)));
    window.scrollTo({ top: 0 });
  };

  const finish = async () => {
    setSaving(true);
    try {
      await persist({ onboardedAt: new Date().toISOString() });
      reload();
      toast.success("Configuração concluída. Bons treinos!");
      navigate("/");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };

  const later = () => {
    sessionStorage.setItem("tricoach.onboardingLater", "1");
    onLater?.();
    navigate(core.profile.onboardedAt ? "/definicoes" : "/");
  };

  const saveGarmin = async () => {
    setGState("busy");
    try {
      await store.garminSaveKey(gKey.trim(), gExp || null);
      setGKey("");
      try { await store.garminSync(); } catch { /* a primeira sincronização corre de novo no agendamento */ }
      setGState("ok");
      toast.success("Chave validada. Os dados recentes já estão a chegar.");
    } catch (e) {
      setGState("idle");
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (on) { await enablePush(store); set({ notifyEnabled: true }); await persist({ notifyEnabled: true }); toast.success("Notificações ativas neste dispositivo"); }
      else { set({ notifyEnabled: false }); await persist({ notifyEnabled: false }); }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setPushBusy(false); }
  };

  const Icon = STEP_META[step].icon;
  const progress = i / (steps.length - 1);
  const install = useInstall();

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="mb-6 flex w-full max-w-2xl items-center justify-between">
        <Logo />
        <Button variant="ghost" size="sm" onClick={later}>{core.profile.onboardedAt ? "Fechar" : "Fazer mais tarde"}</Button>
      </div>

      <div className="w-full max-w-2xl">
        {/* progresso */}
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Passo {i + 1} de {steps.length}</span>
          <span>{STEP_META[step].title}</span>
        </div>
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent" animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ duration: 0.3 }} />
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-6 md:p-8">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div key={step} custom={dir}
                initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.2 }}
                className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <h1 className="text-xl font-semibold tracking-tight">{STEP_META[step].title}</h1>
                </div>

                {step === "welcome" && (
                  <>
                    <p className="text-muted-foreground">Vamos configurar o TriCoach em cerca de 5 minutos. Cada passo explica para que serve o valor e como o descobrir. Se não souber algum, a app propõe uma estimativa e pode afiná-la mais tarde nas Definições.</p>
                    <ul className="grid gap-2 text-sm sm:grid-cols-2">
                      {["Os seus limiares (FC, potência, ritmos)", "A época e a sua prova principal", "Zonas a reforçar no treino funcional", ...(store.mode === "supabase" ? ["A ligação ao Garmin"] : []), "Notificações e instalação da app"].map((t) => (
                        <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-good" />{t}</li>
                      ))}
                    </ul>
                    <Why>Com estes dados a app calcula a carga de cada treino (TSS), as suas zonas e a prontidão diária, e adapta o plano e as sugestões a si.</Why>
                    <div className="space-y-3 rounded-lg border border-warn/40 bg-warn/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-warn"><ShieldAlert className="h-4 w-4" />Aviso importante</div>
                      <DisclaimerText />
                      <label className="flex items-start gap-2 pt-1 text-sm">
                        <Checkbox checked={ack} onCheckedChange={(c) => setAck(!!c)} className="mt-0.5" />
                        <span>Compreendo que o TriCoach não é um treinador nem um profissional de saúde e que devo validar as indicações com um profissional especializado.</span>
                      </label>
                    </div>
                  </>
                )}

                {step === "about" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2"><Field label="Como quer ser tratado?"><Input autoFocus placeholder="Ex.: Marco" value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
                      <Field label="Peso" suffix="kg" hint="Usado para estimar o FTP e para a potência por quilo."><Input type="number" step={0.1} value={p.weight} onChange={(e) => set({ weight: num(e.target.value) })} /></Field>
                      <Field label="Objetivo de sono" suffix="h" hint="A prontidão compara o sono de cada noite com este objetivo."><Input type="number" step={0.5} value={p.sleepTargetH} onChange={(e) => set({ sleepTargetH: num(e.target.value) })} /></Field>
                    </div>
                    <Why>O nome aparece na página Hoje. O sono pesa 25 % no índice de prontidão: se dorme habitualmente 7 h, ponha 7 para não receber alertas desnecessários.</Why>
                  </>
                )}

                {step === "heart" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="FC máxima" suffix="bpm"><Input type="number" value={p.hrMax} onChange={(e) => set({ hrMax: num(e.target.value) })} /></Field>
                      <Field label="FC de limiar (LTHR)" suffix="bpm"><Input type="number" value={p.lthr} onChange={(e) => set({ lthr: num(e.target.value) })} /></Field>
                    </div>
                    <Why>A FC de limiar é a que consegue manter cerca de uma hora a fundo. Define as suas 5 zonas de frequência cardíaca e a carga dos treinos sem potência (natação, corrida sem potenciómetro).</Why>
                    <Help>
                      <p><b>No Garmin:</b> se o seu relógio mede o limiar de lactato, veja em Garmin Connect → Desempenho → <i>Limiar de lactato</i>. Use a FC aí indicada.</p>
                      <p><b>Teste de 30 min:</b> depois de aquecer, corra 30 min o mais forte que conseguir de forma constante. A FC média dos últimos 20 min é a sua FC de limiar.</p>
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="font-medium text-foreground">Não sei: estimar pela idade</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Idade"><Input type="number" className="w-24" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
                          <Button variant="outline" disabled={!age} onClick={() => { const m = hrMaxFromAge(Number(age)); set({ hrMax: m, lthr: lthrFromHrMax(m) }); toast.success(`Estimado: FC máx. ${m}, limiar ${lthrFromHrMax(m)} bpm`); }}>Estimar</Button>
                        </div>
                        <p className="text-[11px]">Fórmula de Tanaka (208 − 0,7 × idade) e limiar ≈ 89 % da máxima. É só um ponto de partida: pode errar 10 bpm.</p>
                      </div>
                    </Help>
                  </>
                )}

                {step === "bike" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="FTP" suffix={p.weight ? `W · ${(p.ftp / p.weight).toFixed(1)} W/kg` : "W"}><Input type="number" value={p.ftp} onChange={(e) => set({ ftp: num(e.target.value) })} /></Field>
                    </div>
                    <Why>O FTP é a potência que consegue manter cerca de uma hora. Define as zonas de potência e a carga (TSS) das voltas de bicicleta. Sem potenciómetro, a app usa a frequência cardíaca.</Why>
                    <Help>
                      <p><b>No Garmin:</b> Garmin Connect → Desempenho → <i>FTP</i> (precisa de potenciómetro).</p>
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="font-medium text-foreground">Fiz um teste de 20 minutos</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Potência média (20 min)" suffix="W"><Input type="number" className="w-40" value={p20} onChange={(e) => setP20(e.target.value)} /></Field>
                          <Button variant="outline" disabled={!p20} onClick={() => { const v = ftpFrom20min(Number(p20)); set({ ftp: v }); toast.success(`FTP = ${v} W (95 % de ${p20} W)`); }}>Calcular</Button>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="font-medium text-foreground">Não sei: estimar pelo nível</p>
                        <div className="flex flex-wrap gap-2">
                          {(["beginner", "intermediate", "advanced"] as const).map((l) => (
                            <Button key={l} variant="outline" size="sm" onClick={() => { const v = ftpFromLevel(p.weight || 70, l); set({ ftp: v }); toast.success(`Estimado: ${v} W`); }}>{LEVEL_LABEL[l]}</Button>
                          ))}
                        </div>
                        <p className="text-[11px]">Usa 2,2 / 3,0 / 3,8 W/kg. Faça um teste quando puder.</p>
                      </div>
                    </Help>
                  </>
                )}

                {step === "run" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Ritmo de limiar" suffix="min/km" hint="Formato minutos:segundos, ex.: 4:45"><Input inputMode="numeric" value={paceText} onChange={(e) => setPaceText(e.target.value)} /></Field>
                    </div>
                    <Why>É o ritmo que aguenta cerca de uma hora a correr forte. Serve para as zonas de corrida, para a carga (rTSS) e para os alvos das sessões do plano.</Why>
                    <Help>
                      <p><b>No Garmin:</b> Desempenho → <i>Limiar de lactato</i> mostra também o ritmo.</p>
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="font-medium text-foreground">Sei o meu tempo aos 10 km</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Tempo de 10 km" hint="ex.: 45:30"><Input className="w-32" value={t10k} onChange={(e) => setT10k(e.target.value)} /></Field>
                          <Button variant="outline" disabled={!parseMmSs(t10k)} onClick={() => { const v = thresholdPaceFrom10k(parseMmSs(t10k)!); setPaceText(fmtMmSs(v)); toast.success(`Ritmo de limiar ≈ ${fmtMmSs(v)}/km`); }}>Calcular</Button>
                        </div>
                        <p className="text-[11px]">Ritmo médio dos 10 km + 4 %.</p>
                      </div>
                    </Help>
                  </>
                )}

                {step === "swim" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="CSS (ritmo crítico de natação)" suffix="/100 m" hint="Formato minutos:segundos, ex.: 1:45"><Input inputMode="numeric" value={cssText} onChange={(e) => setCssText(e.target.value)} /></Field>
                    </div>
                    <Why>O CSS é o ritmo por 100 m que consegue manter sem parar cerca de 30 min. É a referência das zonas e dos treinos de natação.</Why>
                    <Help>
                      <p><b>Teste 400 + 200:</b> depois de aquecer, nade 400 m a fundo, descanse 5–10 min e nade 200 m a fundo.</p>
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Tempo 400 m" hint="ex.: 6:40"><Input className="w-28" value={t400} onChange={(e) => setT400(e.target.value)} /></Field>
                          <Field label="Tempo 200 m" hint="ex.: 3:10"><Input className="w-28" value={t200} onChange={(e) => setT200(e.target.value)} /></Field>
                          <Button variant="outline" disabled={!parseMmSs(t400) || !parseMmSs(t200)} onClick={() => {
                            const v = cssFromTests(parseMmSs(t400)!, parseMmSs(t200)!);
                            if (v <= 0) { toast.error("O tempo dos 400 m tem de ser maior que o dos 200 m."); return; }
                            setCssText(fmtMmSs(v)); toast.success(`CSS = ${fmtMmSs(v)}/100 m`);
                          }}>Calcular</Button>
                        </div>
                        <p className="text-[11px]">CSS = (T400 − T200) ÷ 2.</p>
                      </div>
                      <p><b>Sem teste:</b> use o ritmo a que nada 1500 m de forma contínua.</p>
                    </Help>
                  </>
                )}

                {step === "season" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Início da época" hint="Usado nas estatísticas por época.">
                        <Select value={String(p.seasonStartMonth)} onValueChange={(v) => set({ seasonStartMonth: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{MONTHS_PT.map((m, k) => <SelectItem key={m} value={String(k + 1)}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="space-y-3 rounded-lg border p-4">
                      <div className="text-sm font-medium">Prova principal (opcional)</div>
                      {raceSaved ? (
                        <p className="flex items-center gap-2 text-sm text-good"><CheckCircle2 className="h-4 w-4" />{race.name} guardada como prova A.</p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-3"><Field label="Nome"><Input placeholder="Ex.: Triatlo Olímpico de Lisboa" value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} /></Field></div>
                          <Field label="Data"><Input type="date" min={todayISO()} max={addDays(todayISO(), 730)} value={race.date} onChange={(e) => setRace({ ...race, date: e.target.value })} /></Field>
                          <RaceSportDistance sport={race.sport} distance={race.distance} onChange={(v) => setRace({ ...race, ...v })} />
                        </div>
                      )}
                    </div>
                    <Why>A partir da prova principal (A) a app monta a periodização: base, construção, pico e taper, e ajusta o plano semanal. Pode acrescentar mais provas (B e C) em <i>Época e plano</i>.</Why>
                  </>
                )}

                {step === "plan" && (
                  <>
                    <p className="text-sm text-muted-foreground">Quem define os seus treinos?</p>
                    <PlanSourcePicker value={p.planSource} onChange={(v) => set({ planSource: v })} />
                    {p.planSource === "coach" && (
                      <Why>Depois, em <b>Época e plano</b>, use <b>Importar Excel</b> para trazer o plano que o treinador lhe envia (a app lê o ficheiro e mostra os treinos para confirmar), ou <b>Calendário</b> para ler automaticamente o calendário onde o treinador põe os treinos.</Why>
                    )}
                    <div className="space-y-2 pt-2">
                      <Label>Em que dias costuma descansar?</Label>
                      <RestDaysPicker value={p.restDays} onChange={(v) => set({ restDays: v })} />
                    </div>
                    <Why>Os dias de descanso são os melhores para o treino funcional (força e prevenção). {p.planSource === "app" ? "A app também não põe treinos nesses dias quando gera a semana." : ""}</Why>
                  </>
                )}

                {step === "functional" && (
                  <>
                    <p className="text-sm text-muted-foreground">Onde costuma ter problemas ou sente que precisa de reforço? Toque por ordem de prioridade; as primeiras {MAX_AREAS} entram nas rotinas.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AREAS.map((a) => {
                        const pos = p.functionalAreas.indexOf(a.id);
                        return (
                          <button key={a.id} type="button" title={a.hint} aria-pressed={pos >= 0}
                            onClick={() => set({ functionalAreas: pos >= 0 ? p.functionalAreas.filter((x) => x !== a.id) : [...p.functionalAreas, a.id] })}
                            className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", pos >= 0 ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>
                            {pos >= 0 && <span className="num mr-1 font-semibold">{pos + 1}</span>}{a.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                      <Field label="Nível">
                        <Select value={p.functionalLevel} onValueChange={(v) => set({ functionalLevel: v as AthleteProfile["functionalLevel"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(LEVEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <div className="space-y-1">
                        <Label>Material que tem em casa</Label>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                          {EQUIPMENT.map((e) => (
                            <label key={e.id} className="flex items-center gap-1.5 text-sm">
                              <Checkbox checked={p.functionalEquipment.includes(e.id)} onCheckedChange={(c) => set({ functionalEquipment: c ? [...p.functionalEquipment, e.id] : p.functionalEquipment.filter((x) => x !== e.id) })} />{e.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Why>Nos dias de descanso ou fáceis, a página Hoje sugere rotinas de força e mobilidade para estas zonas, com ilustrações de cada exercício. Pode deixar em branco e escolher mais tarde.</Why>
                  </>
                )}

                {step === "garmin" && (
                  <>
                    <Why>Com a ligação ao Garmin, a app importa as suas atividades, o sono, a HRV, a FC de repouso e o Body Battery. Sem ela, a app funciona mas fica sem dados.</Why>
                    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                      <li>No computador, abra o <b>Garmin Connect</b> (connect.garmin.com) e entre na sua conta.</li>
                      <li>Abra a área <b>Personal API Key</b> e carregue em <b>Create Key</b>.</li>
                      <li>Escolha a validade (de 30 dias a 1 ano) e copie a chave: <b>só é mostrada uma vez</b>.</li>
                      <li>Cole-a aqui em baixo e indique a data de expiração, para a app o avisar antes de expirar.</li>
                    </ol>
                    {gState === "ok" ? (
                      <p className="flex items-center gap-2 rounded-lg border border-good/40 bg-good/10 p-3 text-sm text-good"><CheckCircle2 className="h-4 w-4" />Garmin ligado. Os últimos dias já foram importados; o histórico de 4 anos é importado em segundo plano nas próximas horas (ou já, em Definições → Importar histórico).</p>
                    ) : (
                      <div className="space-y-3 rounded-lg border p-4">
                        <Field label="Chave Personal API"><Input type="password" autoComplete="off" placeholder="Cole aqui a chave" value={gKey} onChange={(e) => setGKey(e.target.value)} /></Field>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Expira em"><Input type="date" value={gExp} onChange={(e) => setGExp(e.target.value)} /></Field>
                          <Button disabled={gKey.trim().length < 10 || gState === "busy"} onClick={saveGarmin}>{gState === "busy" && <Loader2 className="animate-spin" />}Validar e guardar</Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">A chave é validada junto da Garmin e guardada encriptada no servidor; nunca mais volta ao browser.</p>
                      </div>
                    )}
                    {gState !== "ok" && <p className="text-xs text-muted-foreground">Não tem a chave à mão? Avance e ligue mais tarde em Definições → Ligação Garmin.</p>}
                  </>
                )}

                {step === "notify" && (
                  <>
                    <div className="space-y-4 rounded-lg border p-4">
                      <label className="flex items-center justify-between gap-4">
                        <span className="text-sm">
                          <span className="font-medium">Resumo diário</span><br />
                          <span className="text-muted-foreground">Alertas de recuperação (HRV, FC de repouso, sono) e o treino do dia.</span>
                        </span>
                        <Switch checked={p.notifyEnabled} disabled={pushBusy || !pushSupported()} onCheckedChange={togglePush} />
                      </label>
                      {!pushSupported() && <p className="text-xs text-warn">Este browser não suporta notificações. No iPhone, instale primeiro a app no ecrã principal.</p>}
                      <Field label="Hora do resumo">
                        <Select value={String(p.notifyHour)} onValueChange={(v) => set({ notifyHour: Number(v) })}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    </div>
                    {install.platform !== "installed" && (
                      <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex items-center gap-2 text-sm font-medium"><Download className="h-4 w-4" />Instalar como app</div>
                        <p className="text-sm text-muted-foreground">Fica com ícone no ecrã principal e abre em ecrã inteiro. No iPhone é necessário para receber notificações.</p>
                        <InstallAppButton className="w-auto border" />
                      </div>
                    )}
                  </>
                )}

                {step === "done" && (
                  <>
                    <p className="text-muted-foreground">Está tudo pronto{p.name.trim() ? `, ${p.name.trim()}` : ""}. Pode alterar qualquer valor em <b>Definições</b> ou repetir este assistente.</p>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-3">
                      {[
                        ["FC máx. / limiar", `${p.hrMax} / ${p.lthr} bpm`],
                        ["FTP", `${p.ftp} W`],
                        ["Limiar corrida", `${paceText}/km`],
                        ["CSS", `${cssText}/100 m`],
                        ["Peso", `${p.weight} kg`],
                        ["Sono", `${p.sleepTargetH} h`],
                        ["Prova A", raceSaved ? race.name : "–"],
                        ["Plano", p.planSource === "coach" ? "do treinador" : "proposto pela app"],
                        ["Descanso", p.restDays.length ? p.restDays.map((d) => WEEKDAYS_PT[d]).join(", ") : "a app escolhe"],
                        ["Zonas funcionais", p.functionalAreas.length ? `${p.functionalAreas.length}` : "–"],
                        ["Notificações", p.notifyEnabled ? `${String(p.notifyHour).padStart(2, "0")}:00` : "desligadas"],
                      ].map(([k, v]) => (<div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>))}
                    </dl>
                    <Why>Nas primeiras semanas a prontidão e os alertas de saúde ainda estão a aprender os seus valores normais: precisam de cerca de 3 semanas de dados para comparar.</Why>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>
          <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-6 py-4 md:px-8">
            <Button variant="ghost" onClick={() => go(-1)} disabled={i === 0 || saving}><ArrowLeft />Voltar</Button>
            {step === "done" ? (
              <Button onClick={finish} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Começar a usar</Button>
            ) : (
              <Button onClick={() => go(1)} disabled={saving || (step === "welcome" && !ack)}>{saving && <Loader2 className="animate-spin" />}{step === "welcome" ? "Começar" : "Seguinte"}<ArrowRight /></Button>
            )}
          </div>
        </Card>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Os valores são guardados a cada passo.</p>
      </div>
    </div>
  );
}
