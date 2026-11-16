import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, CheckCircle2, Cloud, Info, Link2, Loader2, RefreshCw, ShieldAlert, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PROVIDER_LABEL: Record<string, string> = { icloud: "iCloud", ics: "Calendário (.ics)" };

/** Ligação a um calendário (iCloud por CalDAV, ou qualquer endereço .ics) para trazer os treinos para o plano. */
export function CalendarConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, reload } = useLoaded();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["calendar-feed", store.mode], queryFn: () => store.calendarStatus(), enabled: open });
  const [mode, setMode] = useState<"icloud" | "ics">("icloud");
  const [url, setUrl] = useState("");
  const [appleId, setAppleId] = useState("");
  const [appPw, setAppPw] = useState("");
  const [cals, setCals] = useState<{ url: string; name: string; color: string | null }[] | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const feed = st.data;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); qc.invalidateQueries({ queryKey: ["calendar-feed"] }); }
  };
  const close = () => { setAppPw(""); setCals(null); setChosen(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarSync className="h-5 w-5" />Ligar um calendário</DialogTitle>
          <DialogDescription>Os treinos do calendário (do treinador ou de outras aplicações de treino) passam a aparecer no plano. Só entram os eventos que são treinos; os restantes são ignorados.</DialogDescription>
        </DialogHeader>

        {store.mode === "demo" ? (
          <p className="text-sm text-muted-foreground">Disponível quando entra com a sua conta (não funciona no modo demo).</p>
        ) : st.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : feed ? (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              {PROVIDER_LABEL[feed.provider] ?? "Calendário"}
              {feed.status === "connected" ? <Badge variant="good"><CheckCircle2 className="h-3 w-3" />Ligado</Badge> : <Badge variant="bad">Erro</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Última leitura</dt><dd>{feed.lastSyncAt ? new Date(feed.lastSyncAt).toLocaleString("pt-PT") : "–"}</dd>
              <dt className="text-muted-foreground">Treinos importados</dt><dd>{feed.events}</dd>
            </dl>
            {feed.lastError && <p className="rounded-md bg-bad/10 p-2 text-xs text-bad">{feed.lastError}</p>}
            <p className="text-xs text-muted-foreground">A app volta a ler o calendário de 3 em 3 horas{feed.provider === "icloud" ? " (7 dias para trás e 60 para a frente)" : ""}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("sync", async () => { const r = await store.calendarSync(); reload(); toast.success(`${r.imported} treinos atualizados`); })}>
                {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Ler agora
              </Button>
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("remove", async () => { await store.calendarRemove(); reload(); toast.success("Ligação removida. Os treinos já importados ficam no plano."); })}>
                <Unlink />Desligar
              </Button>
            </div>
            {feed.provider === "icloud" && <p className="text-[11px] text-muted-foreground">Ao desligar, apague também a palavra-passe específica do TriCoach em account.apple.com.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist">
              {([["icloud", "iCloud (Apple)", Cloud], ["ics", "Endereço .ics", Link2]] as const).map(([k, l, I]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                  className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors", mode === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <I className="h-4 w-4" />{l}
                </button>
              ))}
            </div>

            {mode === "icloud" ? (
              <div className="space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Abra <b>account.apple.com</b> → <b>Iniciar sessão e segurança</b> → <b>Palavras-passe específicas de apps</b>.</li>
                  <li>Crie uma com o nome «TriCoach» e copie-a (formato xxxx-xxxx-xxxx-xxxx).</li>
                  <li>Indique abaixo o email da conta Apple e essa palavra-passe, e escolha o calendário dos treinos.</li>
                </ol>
                <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <p>A Apple não tem outra forma de dar acesso ao calendário. Esta palavra-passe também permitiria ler o email do iCloud: a app só a usa para ler o calendário escolhido e guarda-a encriptada no servidor. Pode revogá-la a qualquer momento em account.apple.com. A palavra-passe normal da conta Apple nunca é pedida.</p>
                </div>
                {!cals ? (
                  <>
                    <div className="grid gap-3">
                      <div className="space-y-1"><Label htmlFor="apple-id">Email da conta Apple</Label><Input id="apple-id" type="email" autoComplete="username" value={appleId} onChange={(e) => setAppleId(e.target.value)} placeholder="nome@icloud.com" /></div>
                      <div className="space-y-1"><Label htmlFor="apple-pw">Palavra-passe específica de app</Label><Input id="apple-pw" type="password" autoComplete="off" value={appPw} onChange={(e) => setAppPw(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" /></div>
                    </div>
                    <Button disabled={!appleId.includes("@") || appPw.replace(/\s/g, "").length < 12 || !!busy} onClick={() => run("list", async () => {
                      const list = await store.icloudCalendars(appleId.trim(), appPw);
                      if (!list.length) throw new Error("Não foram encontrados calendários nesta conta iCloud.");
                      setCals(list);
                      setChosen((list.find((c) => /trein|sport|desport|tri/i.test(c.name)) ?? list[0]).url);
                    })}>
                      {busy === "list" ? <Loader2 className="animate-spin" /> : <Cloud />}Ver os meus calendários
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Label>Qual é o calendário dos treinos?</Label>
                    <div className="space-y-1.5" role="radiogroup">
                      {cals.map((c) => (
                        <button key={c.url} type="button" role="radio" aria-checked={chosen === c.url} onClick={() => setChosen(c.url)}
                          className={cn("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", chosen === c.url ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? "hsl(var(--muted-foreground))" }} />{c.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!chosen || !!busy} onClick={() => run("connect", async () => {
                        const name = cals.find((c) => c.url === chosen)?.name ?? "";
                        const r = await store.icloudConnect(appleId.trim(), appPw, chosen, name);
                        setAppPw(""); setCals(null); reload();
                        toast.success(`Calendário «${name}» ligado: ${r.imported} treinos importados`);
                      })}>
                        {busy === "connect" ? <Loader2 className="animate-spin" /> : <Link2 />}Ligar e importar
                      </Button>
                      <Button variant="ghost" onClick={() => setCals(null)}>Voltar</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Para aplicações que dão um endereço de subscrição <b>.ics</b> (também chamado iCal ou webcal). Cada aplicação decide quantos dias mostra e com que frequência o atualiza.</p>
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Na aplicação onde estão os treinos, procure a opção de <b>sincronizar ou exportar o calendário</b> (iCal, .ics ou webcal).</li>
                  <li>Copie o endereço (começa por <code>webcal://</code> ou <code>https://</code>) e cole-o aqui. Fica guardado encriptado no servidor.</li>
                </ol>
                <div className="space-y-1"><Label htmlFor="ics-url">Endereço do calendário</Label><Input id="ics-url" placeholder="webcal://…  ou  https://…/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" /></div>
                <Button disabled={url.trim().length < 12 || !!busy} onClick={() => run("connect", async () => { const r = await store.calendarConnect(url.trim(), "ics"); setUrl(""); reload(); toast.success(`Calendário ligado: ${r.imported} treinos importados`); })}>
                  {busy === "connect" ? <Loader2 className="animate-spin" /> : <Link2 />}Ligar e importar
                </Button>
                <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  Sem endereço? Exporte o calendário para um ficheiro .ics e use <b>Importar ficheiro</b> na página do plano.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
