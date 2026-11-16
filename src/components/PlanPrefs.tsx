import { Moon, Sparkles, UserCheck } from "lucide-react";
import { WEEKDAYS_PT } from "@/lib/dates";
import type { AthleteProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Quem faz o plano: a app ou o treinador. */
export function PlanSourcePicker({ value, onChange }: { value: AthleteProfile["planSource"]; onChange: (v: AthleteProfile["planSource"]) => void }) {
  const opts = [
    { v: "app" as const, icon: Sparkles, title: "A app propõe o plano", text: "Gera as semanas a partir da periodização, da sua forma atual e das provas. Pode editar tudo." },
    { v: "coach" as const, icon: UserCheck, title: "Tenho treinador", text: "A app não propõe treinos. Importa os treinos do treinador (Excel ou calendário) e compara com o que fez." },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cn("flex gap-3 rounded-lg border p-3 text-left transition-colors", value === o.v ? "border-primary bg-primary/10" : "hover:bg-muted")}>
          <o.icon className={cn("mt-0.5 h-5 w-5 shrink-0", value === o.v ? "text-primary" : "text-muted-foreground")} />
          <span><span className="block text-sm font-medium">{o.title}</span><span className="text-xs text-muted-foreground">{o.text}</span></span>
        </button>
      ))}
    </div>
  );
}

/** Dias de descanso habituais (0 = segunda … 6 = domingo). */
export function RestDaysPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS_PT.map((w, k) => (
          <button key={w} type="button" aria-pressed={value.includes(k)} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k].sort())}
            className={cn("flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors", value.includes(k) ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted")}>
            {value.includes(k) && <Moon className="h-3.5 w-3.5" />}{w}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{value.length ? "O treino funcional só é sugerido nestes dias. Pode mudá-los semana a semana em Época e plano." : "Sem dias escolhidos, a app usa os dias sem treino planeado."}</p>
    </div>
  );
}
