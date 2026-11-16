import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const DISCLAIMER_SHORT = "O TriCoach não é um treinador nem um profissional de saúde. Valide todas as indicações com um profissional especializado.";

/** Texto completo do aviso (assistente inicial e janela "Saber mais"). */
export function DisclaimerText() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p><b className="text-foreground">O TriCoach não é um treinador, médico, nutricionista nem fisioterapeuta.</b></p>
      <p>Os planos, as sugestões de treino, as rotinas de exercícios, o índice de prontidão e os alertas de saúde são calculados automaticamente a partir dos seus dados e de regras gerais. Servem apenas como informação e podem não ser adequados ao seu caso.</p>
      <p>Todas as indicações devem ser validadas por um profissional especializado (treinador, médico ou fisioterapeuta) antes de as seguir, sobretudo se tiver lesões, doenças, estiver a recuperar de uma paragem ou a tomar medicação.</p>
      <p>Se sentir dor no peito, falta de ar, tonturas, palpitações ou dor que não passa, pare o exercício e procure ajuda médica.</p>
    </div>
  );
}

/** Linha curta com "Saber mais" (rodapé das páginas, login). */
export function DisclaimerNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className={cn("flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground", className)}>
        <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>{DISCLAIMER_SHORT} <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setOpen(true)}>Saber mais</button></span>
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-warn" />Aviso importante</DialogTitle>
            <DialogDescription className="sr-only">Limitações do TriCoach</DialogDescription>
          </DialogHeader>
          <DisclaimerText />
        </DialogContent>
      </Dialog>
    </>
  );
}
