import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WIDGET, type FieldDef } from "./registry";
import type { DashboardWidget } from "@/lib/types";

export function YearsPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-3">
      {[1, 2, 3].map((k) => (
        <label key={k} className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={value.includes(k)} onCheckedChange={(c) => onChange(c ? [...value, k].sort() : value.filter((x) => x !== k))} />
          N-{k}
        </label>
      ))}
    </div>
  );
}

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  switch (f.kind) {
    case "select":
      return (
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "multi": {
      const v: string[] = value ?? [];
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {f.options.map((o) => {
            const on = v.includes(o.value);
            const full = !!f.max && v.length >= f.max && !on;
            return (
              <label key={o.value} className={"flex items-center gap-1.5 text-sm " + (full ? "opacity-40" : "")}>
                <Checkbox checked={on} disabled={full} onCheckedChange={(c) => onChange(c ? [...v, o.value] : v.filter((x) => x !== o.value))} />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    }
    case "years":
      return <YearsPicker value={value ?? []} onChange={onChange} />;
    case "number":
      return <Input type="number" min={f.min} max={f.max} value={value ?? ""} onChange={(e) => onChange(Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min)))} />;
    case "text":
      return <textarea className="min-h-[120px] w-full rounded-md border border-input bg-transparent p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function WidgetConfigDialog({ widget, onClose, onSave }: { widget: DashboardWidget | null; onClose: () => void; onSave: (w: DashboardWidget) => void }) {
  const def = widget ? WIDGET[widget.type] : null;
  const [cfg, setCfg] = useState<Record<string, any>>({});
  useEffect(() => setCfg(widget?.config ?? {}), [widget]);
  if (!widget || !def) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{def.label}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título (opcional)</Label>
            <Input value={cfg.title ?? ""} placeholder={def.title?.({ ...def.defaults, ...cfg }) ?? def.label} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
          </div>
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <FieldInput f={f} value={cfg[f.key] ?? def.defaults[f.key]} onChange={(v) => setCfg({ ...cfg, [f.key]: v })} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { onSave({ ...widget, config: cfg }); onClose(); }}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
