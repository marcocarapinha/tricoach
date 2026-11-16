import { useState } from "react";
import { Download, LogOut, PlusSquare, Share } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useData } from "@/lib/data/DataProvider";
import { useInstall } from "@/lib/install";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const itemCls = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** "Instalar app": usa o pedido do browser quando existe; senão mostra como instalar (iPhone/iPad, outros). */
export function InstallAppButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const { platform, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (platform === "installed") return null;
  const click = async () => {
    if (platform === "prompt") {
      if (await install()) toast.success("TriCoach instalada. Pode abri-la a partir do ecrã principal.");
      onDone?.();
    } else setHelp(true);
  };
  return (
    <>
      <button className={cn(itemCls, className)} onClick={click}><Download className="h-4 w-4" />Instalar app</button>
      <Dialog open={help} onOpenChange={(o) => { setHelp(o); if (!o) onDone?.(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar o TriCoach</DialogTitle>
            <DialogDescription>Fica com ícone próprio, abre em ecrã inteiro e pode receber notificações.</DialogDescription>
          </DialogHeader>
          {platform === "ios" && (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Toque em <Share className="inline h-4 w-4 align-text-bottom" /> <b>Partilhar</b>, na barra do Safari.</li>
              <li>Escolha <PlusSquare className="inline h-4 w-4 align-text-bottom" /> <b>Adicionar ao ecrã principal</b>.</li>
              <li>Confirme com <b>Adicionar</b>.</li>
            </ol>
          )}
          {platform === "ios-other" && (
            <p className="text-sm">No iPhone e no iPad a instalação faz-se pelo <b>Safari</b>: abra este endereço no Safari, toque em <b>Partilhar</b> e depois em <b>Adicionar ao ecrã principal</b>.</p>
          )}
          {platform === "manual" && (
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li><b>Chrome / Edge (computador):</b> ícone de instalar no fim da barra de endereço, ou menu ⋮ → <b>Transmitir, guardar e partilhar → Instalar página como app</b>.</li>
              <li><b>Chrome (Android):</b> menu ⋮ → <b>Adicionar ao ecrã principal</b> → <b>Instalar</b>.</li>
              <li><b>Safari (Mac):</b> menu <b>Ficheiro → Adicionar à Dock</b>.</li>
              <li><b>Firefox:</b> não instala apps web no computador; use o Chrome, o Edge ou o Safari.</li>
            </ul>
          )}
          <DialogFooter><Button onClick={() => setHelp(false)}>Percebi</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Terminar sessão" (conta Supabase) ou "Sair do modo demo". Não aparece no modo demo sem Supabase. */
export function SignOutButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const { session, store } = useData();
  const [busy, setBusy] = useState(false);
  if (!supabase) return null;
  if (store.mode === "demo") {
    return (
      <button className={cn(itemCls, className)} onClick={() => { sessionStorage.removeItem("tricoach.forceDemo"); location.assign("/"); }}>
        <LogOut className="h-4 w-4" />Sair do modo demo
      </button>
    );
  }
  if (!session) return null;
  const out = async () => {
    setBusy(true);
    await supabase!.auth.signOut({ scope: "local" }).catch(() => {});
    onDone?.();
    location.assign("/"); // limpa o estado e a cache da app em memória
  };
  return (
    <button className={cn(itemCls, className)} onClick={out} disabled={busy} title={session.user.email ?? undefined}>
      <LogOut className="h-4 w-4" />Terminar sessão
    </button>
  );
}
