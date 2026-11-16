import React from "react";
import { AlertTriangle, Check, Info, ShieldAlert, X, Ban } from "lucide-react";
import type { Readiness } from "@/lib/engine/health";
import type { Phase, Suggestion, SuggestionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Cores por ano de comparação: ano atual em destaque, anos anteriores progressivamente mais neutros. */
export const OFFSET_COLOR: Record<number, string> = {
  0: "hsl(var(--year-0))",
  1: "hsl(var(--year-1))",
  2: "hsl(var(--year-2))",
  3: "hsl(var(--year-3))",
};

export const LEVEL_COLOR = { green: "hsl(var(--good))", amber: "hsl(var(--warn))", red: "hsl(var(--bad))", unknown: "hsl(var(--muted-foreground))" };
export const LEVEL_LABEL = { green: "Pronto", amber: "Moderado", red: "Recuperar", unknown: "Sem dados" };

export function ReadinessGauge({ r, size = 148 }: { r: Readiness; size?: number }) {
  const stroke = 12;
  const rad = (size - stroke) / 2;
  const c = 2 * Math.PI * rad;
  const arc = 0.75; // 270°
  const v = (r.score ?? 0) / 100;
  const color = LEVEL_COLOR[r.level];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[225deg]">
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${c * arc * v} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-4xl font-semibold tracking-tight">{r.score ?? "–"}</span>
        <span className="text-xs font-medium" style={{ color }}>{LEVEL_LABEL[r.level]}</span>
      </div>
    </div>
  );
}

export function ComponentBars({ r }: { r: Readiness }) {
  return (
    <div className="space-y-2">
      {r.components.map((c) => (
        <div key={c.key} className="space-y-1" title={c.detail}>
          <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{c.label}</span><span className="num">{c.score == null ? "–" : Math.round(c.score)}</span></div>
          <div className="h-1.5 rounded-full bg-muted">
            {c.score != null && <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 70 ? LEVEL_COLOR.green : c.score >= 45 ? LEVEL_COLOR.amber : LEVEL_COLOR.red }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

const SEV = {
  alert: { icon: ShieldAlert, cls: "border-bad/40 bg-bad/5", badge: "bad" as const, label: "Alerta" },
  warn: { icon: AlertTriangle, cls: "border-warn/40 bg-warn/5", badge: "warn" as const, label: "Atenção" },
  info: { icon: Info, cls: "border-border", badge: "outline" as const, label: "Sugestão" },
};

export function SuggestionCard({ s, status, onStatus, compact }: { s: Suggestion; status?: SuggestionStatus; onStatus?: (st: SuggestionStatus) => void; compact?: boolean }) {
  const sev = SEV[s.severity];
  const Icon = sev.icon;
  const done = status && status !== "new";
  return (
    <div className={cn("rounded-lg border p-3", sev.cls, done && "opacity-60")}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.severity === "alert" ? "text-bad" : s.severity === "warn" ? "text-warn" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{s.title}</span>
            <Badge variant={sev.badge}>{sev.label}</Badge>
            {!compact && <span className="text-[11px] text-muted-foreground">confiança {s.confidence}</span>}
          </div>
          <p className="text-sm">{s.action}</p>
          {!compact && <p className="text-xs text-muted-foreground">Porquê: {s.reason}</p>}
          {onStatus && !compact && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant={status === "followed" ? "default" : "outline"} onClick={() => onStatus("followed")}><Check />Seguir</Button>
              <Button size="sm" variant={status === "ignored" ? "secondary" : "ghost"} onClick={() => onStatus("ignored")}><X />Ignorar</Button>
              <Button size="sm" variant={status === "not_applicable" ? "secondary" : "ghost"} onClick={() => onStatus("not_applicable")}><Ban />Não se aplica</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeltaBadge({ pct, good }: { pct: number | null; good: boolean }) {
  if (pct == null || !isFinite(pct)) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <span className={cn("num whitespace-nowrap text-xs font-medium", good ? "text-good" : "text-bad")}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-[80px] items-center justify-center text-center text-sm text-muted-foreground">{children}</div>;
}

export const PHASE_COLOR: Record<Phase, string> = {
  transition: "hsl(var(--phase-transition))",
  base: "hsl(var(--phase-base))",
  build: "hsl(var(--phase-build))",
  peak: "hsl(var(--phase-peak))",
  taper: "hsl(var(--phase-taper))",
  race: "hsl(var(--phase-race))",
  recovery: "hsl(var(--phase-recovery))",
};

/** Seletor 1–5 com botões (check-in). */
export function Scale5({ value, onChange, low, high }: { value: number; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n}
            className={cn("num h-9 flex-1 rounded-md border text-sm font-medium transition-colors", value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}
