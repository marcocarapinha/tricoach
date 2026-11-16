import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/utils";

/** Lista das regras com o estado de cada uma, enquanto a pessoa escreve. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-live="polite">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={cn("flex items-center gap-1.5", ok ? "text-good" : "text-muted-foreground")}>
            {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
