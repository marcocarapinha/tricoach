import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, CheckCircle2, Info, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Ligação a um calendário .ics (do treinador ou de outras aplicações) para trazer os treinos para o plano. */
export function CalendarConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, reload } = useLoaded();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["calendar-feed", store.mode], queryFn: () => store.calendarStatus(), enabled: open });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const feed = st.data;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); qc.invalidateQueries({ queryKey: ["calendar-feed"] }); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarSync className="h-5 w-5" />Ligar um calendário</DialogTitle>
          <DialogDescription>Os treinos que estão no calendário (do treinador ou de outras aplicações de treino) passam a aparecer no plano da app.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Funciona com qualquer calendário que tenha um endereço de subscrição <b>.ics</b> (também chamado iCal ou webcal). Só são importados os eventos que são treinos (natação, ciclismo, corrida, força…); os restantes são ignorados. Cada aplicação decide quantos dias mostra no calendário e com que frequência o atualiza.</p>
        </div>

        {store.mode === "demo" ? (
          <p className="text-sm text-muted-foreground">Disponível quando entra com a sua conta (não funciona no modo demo).</p>
        ) : st.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : feed ? (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              Calendário
              {feed.status === "connected" ? <Badge variant="good"><CheckCircle2 className="h-3 w-3" />Ligado</Badge> : <Badge variant="bad">Erro</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Última leitura</dt><dd>{feed.lastSyncAt ? new Date(feed.lastSyncAt).toLocaleString("pt-PT") : "–"}</dd>
              <dt className="text-muted-foreground">Treinos importados</dt><dd>{feed.events}</dd>
            </dl>
            {feed.lastError && <p className="rounded-md bg-bad/10 p-2 text-xs text-bad">{feed.lastError}</p>}
            <p className="text-xs text-muted-foreground">A app volta a ler o calendário de 3 em 3 horas.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("sync", async () => { const r = await store.calendarSync(); reload(); toast.success(`${r.imported} treinos atualizados`); })}>
                {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Ler agora
              </Button>
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("remove", async () => { await store.calendarRemove(); reload(); toast.success("Ligação removida. Os treinos já importados ficam no plano."); })}>
                <Unlink />Desligar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Na aplicação onde estão os treinos, procure a opção de <b>sincronizar ou exportar o calendário</b> (iCal, .ics ou webcal).</li>
              <li>Copie o endereço de subscrição (começa por <code>webcal://</code> ou <code>https://</code>).</li>
              <li>Cole-o aqui. O endereço fica guardado encriptado no servidor.</li>
            </ol>
            <div className="space-y-1"><Label>Endereço do calendário</Label><Input placeholder="webcal://…  ou  https://…/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" /></div>
            <Button disabled={url.trim().length < 12 || !!busy} onClick={() => run("connect", async () => { const r = await store.calendarConnect(url.trim(), "ics"); setUrl(""); reload(); toast.success(`Calendário ligado: ${r.imported} treinos importados`); })}>
              {busy === "connect" ? <Loader2 className="animate-spin" /> : <Link2 />}Ligar e importar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
