import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, CloudDownload, KeyRound, Loader2, LogOut, RefreshCw, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AREAS, EQUIPMENT, LEVEL_LABEL as FUNC_LEVEL_LABEL } from "@/lib/engine/functional";
import { disablePush, enablePush, pushSupported } from "@/lib/push";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common";
import { SecurityCard } from "@/components/auth/SecurityCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AthleteProfile } from "@/lib/types";
import { MONTHS_PT, diffDays, fmtDatePt, fmtPace, todayISO } from "@/lib/dates";

export default function SettingsPage() {
  const { store } = useLoaded();
  return (
    <div>
      <PageHeader title="Definições" />
      <div className="grid gap-6 lg:grid-cols-2">
        <GarminCard />
        <ProfileCard />
        <NotificationsCard />
        {store.mode === "supabase" && <SecurityCard />}
      </div>
    </div>
  );
}

function GarminCard() {
  const { store, reload, session } = useLoaded();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["garmin", store.mode], queryFn: () => store.garminStatus() });
  const [key, setKey] = useState("");
  const [exp, setExp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const c = st.data;
  const daysLeft = c?.keyExpiresAt ? diffDays(todayISO(), c.keyExpiresAt) : null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); qc.invalidateQueries({ queryKey: ["garmin"] }); }
  };

  const backfill = () => run("backfill", async () => {
    setProgress(0);
    for (let i = 0; i < 80; i++) {
      const r = await store.garminBackfillStep();
      setProgress(r.progress);
      if (r.errors?.length) toast.warning(r.errors[0]);
      if (r.done) break;
    }
    setProgress(null);
    reload();
    toast.success("Histórico importado");
  });

  if (store.mode === "demo") {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Ligação Garmin</CardTitle><CardDescription>Modo demo: a app mostra 4 anos de dados simulados.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Para usar os seus dados reais:</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Crie um projeto Supabase e aplique a migração em <code>supabase/migrations</code>.</li>
            <li>Publique a Edge Function <code>garmin-sync</code>.</li>
            <li>Preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> no <code>.env</code>.</li>
            <li>Entre com a sua conta e cole aqui a chave da Garmin Personal API.</li>
          </ol>
          {supabase && <Button variant="outline" onClick={() => { sessionStorage.removeItem("tricoach.forceDemo"); location.reload(); }}>Sair do modo demo</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Ligação Garmin
          {c?.status === "connected" ? <Badge variant="good"><CheckCircle2 className="h-3 w-3" />Ligado</Badge> : c?.status === "error" ? <Badge variant="bad">Erro</Badge> : <Badge variant="outline">Não ligado</Badge>}
        </CardTitle>
        <CardDescription>A chave fica encriptada no servidor (Supabase Vault) e nunca é enviada para o browser depois de guardada.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {daysLeft != null && daysLeft <= 14 && (
          <div className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-sm text-warn"><AlertTriangle className="h-4 w-4" />A chave expira {daysLeft <= 0 ? "hoje ou já expirou" : `daqui a ${daysLeft} dias`}. Crie uma nova no Garmin Connect.</div>
        )}
        {c?.lastError && <div className="rounded-md border border-bad/40 bg-bad/10 p-2 text-xs text-bad">Último erro: {c.lastError}</div>}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Expiração da chave</dt><dd>{c?.keyExpiresAt ? fmtDatePt(c.keyExpiresAt) : "–"}</dd>
          <dt className="text-muted-foreground">Última sincronização</dt><dd>{c?.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("pt-PT") : "–"}</dd>
          <dt className="text-muted-foreground">Histórico</dt><dd>{c?.backfillDone ? "completo (4 anos)" : c?.backfillCursor ? `importado até ${fmtDatePt(c.backfillCursor)}` : "por importar"}</dd>
        </dl>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Chave Personal API</Label>
          <Input type="password" autoComplete="off" placeholder="Cole a chave criada no Garmin Connect Web" value={key} onChange={(e) => setKey(e.target.value)} />
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1"><Label>Expira em</Label><Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></div>
            <Button disabled={!key || !!busy} onClick={() => run("key", async () => { await store.garminSaveKey(key, exp || null); setKey(""); toast.success("Chave validada e guardada"); })}>
              {busy === "key" && <Loader2 className="animate-spin" />}Guardar chave
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Garmin Connect Web → Personal API Key → Create Key. A chave só é mostrada uma vez; validade de 30 dias a 1 ano.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={c?.status !== "connected" || !!busy} onClick={() => run("sync", async () => { const r = await store.garminSync(); reload(); toast.success(`Sincronizado: ${r.total} registos`); })}>
            {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sincronizar agora
          </Button>
          <Button variant="outline" disabled={c?.status !== "connected" || !!busy || c?.backfillDone} onClick={backfill}>
            {busy === "backfill" ? <Loader2 className="animate-spin" /> : <CloudDownload />}Importar histórico (4 anos)
          </Button>
        </div>
        {progress != null && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} /></div>
            <div className="text-[11px] text-muted-foreground">{Math.round(progress * 100)}% · blocos de 90 dias</div>
          </div>
        )}
        {session && <Button variant="ghost" size="sm" onClick={() => supabase!.auth.signOut()}><LogOut />Terminar sessão ({session.user.email})</Button>}
      </CardContent>
    </Card>
  );
}

function NumField({ label, value, onChange, suffix, step = 1 }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="relative"><Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <span className="pointer-events-none absolute right-3 top-2 text-xs text-muted-foreground">{suffix}</span>}</div>
    </div>
  );
}

function ProfileCard() {
  const { core, store, reload } = useLoaded();
  const [p, setP] = useState<AthleteProfile>(core.profile);
  useEffect(() => { setP(core.profile); }, [core]);
  const set = (patch: Partial<AthleteProfile>) => setP({ ...p, ...patch });
  const hrZones = [0.85, 0.9, 0.95, 1.0].map((f) => Math.round(p.lthr * f));
  const pwZones = [0.55, 0.75, 0.9, 1.05].map((f) => Math.round(p.ftp * f));
  const wsum = Object.values(p.weights).reduce((s, x) => s + x, 0);

  return (
    <Card>
      <CardHeader><CardTitle>Perfil do atleta</CardTitle><CardDescription>Limiares usados no cálculo de TSS, zonas e prontidão.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 space-y-1 md:col-span-3"><Label>Nome</Label><Input value={p.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <NumField label="FTP" suffix="W" value={p.ftp} onChange={(v) => set({ ftp: v })} />
          <NumField label="Limiar corrida" suffix={`s/km · ${fmtPace(p.runThresholdPace)}`} value={p.runThresholdPace} onChange={(v) => set({ runThresholdPace: v })} />
          <NumField label="CSS natação" suffix={`s/100m · ${fmtPace(p.css)}`} value={p.css} onChange={(v) => set({ css: v })} />
          <NumField label="FC máxima" suffix="bpm" value={p.hrMax} onChange={(v) => set({ hrMax: v })} />
          <NumField label="FC limiar (LTHR)" suffix="bpm" value={p.lthr} onChange={(v) => set({ lthr: v })} />
          <NumField label="Peso" suffix="kg" step={0.1} value={p.weight} onChange={(v) => set({ weight: v })} />
          <NumField label="Objetivo de sono" suffix="h" step={0.5} value={p.sleepTargetH} onChange={(v) => set({ sleepTargetH: v })} />
          <div className="space-y-1">
            <Label>Início da época</Label>
            <Select value={String(p.seasonStartMonth)} onValueChange={(v) => set({ seasonStartMonth: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-xs md:grid-cols-2">
          <div><div className="mb-1 font-medium">Zonas FC (% LTHR)</div>Z1 &lt;{hrZones[0]} · Z2 {hrZones[0]}–{hrZones[1] - 1} · Z3 {hrZones[1]}–{hrZones[2] - 1} · Z4 {hrZones[2]}–{hrZones[3] - 1} · Z5 ≥{hrZones[3]}</div>
          <div><div className="mb-1 font-medium">Zonas potência (% FTP)</div>Z1 &lt;{pwZones[0]} · Z2 {pwZones[0]}–{pwZones[1] - 1} · Z3 {pwZones[1]}–{pwZones[2] - 1} · Z4 {pwZones[2]}–{pwZones[3] - 1} · Z5 ≥{pwZones[3]} W</div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <div className="text-sm font-semibold">Treino funcional</div>
            <p className="text-xs text-muted-foreground">Escolha as zonas problemáticas por ordem de prioridade (até 4 entram nas rotinas). A app sugere força e mobilidade nos dias de descanso.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => {
              const pos = p.functionalAreas.indexOf(a.id);
              return (
                <button key={a.id} type="button" title={a.hint} aria-pressed={pos >= 0}
                  onClick={() => set({ functionalAreas: pos >= 0 ? p.functionalAreas.filter((x) => x !== a.id) : [...p.functionalAreas, a.id] })}
                  className={"rounded-full border px-2.5 py-1 text-xs transition-colors " + (pos >= 0 ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>
                  {pos >= 0 && <span className="num mr-1 font-semibold">{pos + 1}</span>}{a.label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1">
              <Label>Nível</Label>
              <Select value={p.functionalLevel} onValueChange={(v) => set({ functionalLevel: v as AthleteProfile["functionalLevel"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FUNC_LEVEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Material disponível (além do peso corporal)</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                {EQUIPMENT.map((e) => (
                  <label key={e.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={p.functionalEquipment.includes(e.id)} onCheckedChange={(c) => set({ functionalEquipment: c ? [...p.functionalEquipment, e.id] : p.functionalEquipment.filter((x) => x !== e.id) })} />{e.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pesos do índice de prontidão {wsum !== 100 && <span className="text-warn">(soma {wsum}; são normalizados)</span>}</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {([["hrv", "HRV"], ["sleep", "Sono"], ["tsb", "TSB"], ["rhr", "FC rep."], ["energy", "BB/stress"], ["feel", "Sensações"]] as const).map(([k, l]) => (
              <div key={k} className="space-y-1"><div className="text-[11px] text-muted-foreground">{l}</div><Input type="number" value={p.weights[k]} onChange={(e) => set({ weights: { ...p.weights, [k]: Number(e.target.value) } })} /></div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">As provas e a periodização passaram para <a href="/plano" className="text-primary hover:underline">Época e plano</a>.</p>

        <Button onClick={async () => { await store.saveProfile(p); reload(); toast.success("Perfil guardado"); }}>Guardar perfil</Button>
      </CardContent>
    </Card>
  );
}

function NotificationsCard() {
  const { core, store, reload } = useLoaded();
  const [busy, setBusy] = useState(false);
  const p = core.profile;
  const supported = pushSupported();
  const perm = supported ? Notification.permission : "denied";
  const save = async (patch: Partial<AthleteProfile>) => { await store.saveProfile({ ...p, ...patch }); reload(); };
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const mode = await enablePush(store);
        await save({ notifyEnabled: true });
        toast.success(mode === "push" ? "Notificações ativas neste dispositivo" : "Notificações locais ativas (o envio diário automático precisa do Supabase com chaves VAPID)");
      } else { await disablePush(store); await save({ notifyEnabled: false }); toast.success("Notificações desligadas"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />Notificações</CardTitle>
        <CardDescription>Resumo diário à hora escolhida: alertas de saúde (HRV, FC de repouso, sono) e o treino planeado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported && <div className="rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">Este browser não suporta notificações push. No iPhone, instale a app no ecrã principal primeiro.</div>}
        {supported && perm === "denied" && <div className="rounded-md border border-bad/40 bg-bad/10 p-2 text-xs text-bad">As notificações estão bloqueadas para este site nas definições do browser.</div>}
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">Ativar notificações neste dispositivo</span>
          <Switch checked={p.notifyEnabled} disabled={busy || !supported} onCheckedChange={toggle} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Hora do resumo</Label>
            <Select value={String(p.notifyHour)} onValueChange={(v) => save({ notifyHour: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Fuso horário</Label><Input value={p.timezone} onChange={(e) => save({ timezone: e.target.value })} /></div>
        </div>
        <Button variant="outline" disabled={!p.notifyEnabled || busy} onClick={async () => { try { await store.sendTestNotification(); toast.success("Notificação de teste enviada"); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } }}>
          <Send />Enviar notificação de teste
        </Button>
        {store.mode === "demo" && <p className="text-[11px] text-muted-foreground">Modo demo: o teste mostra uma notificação local. O envio automático diário corre no servidor (Edge Function notify).</p>}
      </CardContent>
    </Card>
  );
}
