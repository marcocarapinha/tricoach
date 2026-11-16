import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useLoaded } from "@/lib/data/DataProvider";
import { importSheets, readSpreadsheet, type DraftSession, type ImportResult, type Sheet } from "@/lib/coach-import";
import { plannedTss } from "@/lib/engine/plan";
import { addDays, fmtDatePt, startOfWeek, todayISO, WEEKDAYS_PT, diffDays } from "@/lib/dates";
import { SESSION_LABEL, SPORT_COLOR, SPORT_LABEL, type PlannedSession, type SessionType, type Sport } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SPORTS: Sport[] = ["swim", "bike", "run", "brick", "strength", "other"];
const TYPES: SessionType[] = ["recovery", "technique", "endurance", "long", "tempo", "intervals", "race", "functional"];
const LAYOUT_LABEL: Record<ImportResult["layout"], string> = {
  list: "lista com datas", grid: "grelha semanal (dias em colunas)", "grid-transposed": "grelha semanal (dias em linhas)", cells: "células soltas",
};

/** Sessão importada → sessão planeada (um passo aberto com a duração; o detalhe fica nas notas). */
export function draftToPlanned(d: DraftSession): PlannedSession {
  return {
    id: "", date: d.date, sport: d.sport, type: d.type, durationMin: d.durationMin,
    tss: plannedTss(d.sport, d.type, d.durationMin), title: d.title, description: d.description,
    steps: [{ kind: "step", intensity: "active", durationS: d.durationMin * 60, target: { type: "open" }, name: d.title.slice(0, 15) }],
    source: "coach",
  };
}

/** Importar o plano do treinador a partir de um Excel/CSV, com revisão e afinação antes de gravar. */
export function CoachImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { core, store, reload } = useLoaded();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [start, setStart] = useState(startOfWeek(addDays(todayISO(), 7)));
  const [rows, setRows] = useState<DraftSession[]>([]);
  const [meta, setMeta] = useState<Omit<ImportResult, "sessions"> | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const paces = { runThresholdPace: core.profile.runThresholdPace, css: core.profile.css };

  const run = (sh: Sheet[], startDate: string) => {
    const r = importSheets(sh, paces, startDate);
    setRows(r.sessions);
    const { sessions: _s, ...m } = r;
    setMeta(m);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy("read");
    try {
      const sh = await readSpreadsheet(f);
      setFileName(f.name);
      setSheets(sh);
      run(sh, start);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };

  const upd = (key: string, patch: Partial<DraftSession>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch, estimated: "durationMin" in patch ? false : x.estimated } : x)));
  const chosen = rows.filter((r) => r.include);
  const dates = useMemo(() => [...new Set(chosen.map((r) => r.date))].sort(), [chosen]);
  const existing = core.planned.filter((p) => dates.includes(p.date) && p.source !== "functional");
  const byWeek = useMemo(() => {
    const m = new Map<string, DraftSession[]>();
    for (const r of rows) { const w = startOfWeek(r.date); m.set(w, [...(m.get(w) ?? []), r]); }
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [rows]);

  const save = async () => {
    setBusy("save");
    try {
      if (replace && existing.length) await store.deletePlanned(existing.map((p) => p.id));
      await store.savePlanned(chosen.map(draftToPlanned));
      reload();
      toast.success(`${chosen.length} treinos importados${replace && existing.length ? ` (${existing.length} substituídos)` : ""}`);
      reset(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const reset = () => { setSheets(null); setRows([]); setMeta(null); setFileName(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Importar treinos do treinador</DialogTitle>
          <DialogDescription>Excel (.xlsx) ou CSV, no formato que o seu treinador usar. A app lê o ficheiro, propõe as sessões e pode corrigir tudo antes de importar.</DialogDescription>
        </DialogHeader>

        {!sheets ? (
          <div className="space-y-4">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === "read"}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary hover:bg-primary/5">
              {busy === "read" ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
              <span className="font-medium">Escolher ficheiro ou arrastar para aqui</span>
              <span className="text-xs text-muted-foreground">.xlsx, .csv · o ficheiro é lido só no seu dispositivo</span>
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-3">
              <div><div className="font-medium">Lista</div><p className="text-xs text-muted-foreground">Uma linha por treino, com a data numa coluna: «18/11 | Bike | 1h30 Z2».</p></div>
              <div><div className="font-medium">Grelha semanal</div><p className="text-xs text-muted-foreground">Colunas Seg…Dom e uma semana por linha (com data ou «Semana 1»).</p></div>
              <div><div className="font-medium">Texto livre</div><p className="text-xs text-muted-foreground">«Natação 2000m técnica», «Corrida 45' solto», «Descanso»: modalidade, duração ou distância e intensidade.</p></div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="space-y-0.5">
                <div className="font-medium">{fileName}</div>
                <div className="text-xs text-muted-foreground">Arrumação detetada: {meta ? LAYOUT_LABEL[meta.layout] : "–"} · {rows.length} treinos encontrados</div>
              </div>
              {meta?.usesStartDate && (
                <div className="space-y-1">
                  <Label className="text-xs">A «Semana 1» começa em</Label>
                  <Input type="date" className="h-8 w-40" value={start} onChange={(e) => { const v = startOfWeek(e.target.value || start); setStart(v); run(sheets, v); }} />
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>Outro ficheiro</Button>
            </div>

            {!!meta?.warnings.length && (
              <div className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                {meta.warnings.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
              </div>
            )}

            {byWeek.map(([ws, items]) => (
              <div key={ws} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" />Semana de {fmtDatePt(ws)}</div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr>{["", "Data", "Modalidade", "Tipo", "Min", "Título", "Do ficheiro", ""].map((h, k) => <th key={k} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.key} className={cn("border-t align-top", !r.include && "opacity-40")}>
                          <td className="px-2 py-1.5"><Checkbox checked={r.include} onCheckedChange={(c) => upd(r.key, { include: !!c })} aria-label="Importar" /></td>
                          <td className="px-2 py-1.5">
                            <Input type="date" className="h-8 w-[132px] text-xs" value={r.date} onChange={(e) => e.target.value && upd(r.key, { date: e.target.value })} />
                            <div className="pt-0.5 text-[10px] text-muted-foreground">{WEEKDAYS_PT[diffDays(startOfWeek(r.date), r.date)]}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={r.sport} onValueChange={(v) => upd(r.key, { sport: v as Sport })}>
                              <SelectTrigger className="h-8 w-[136px] text-xs"><span className="mr-1 h-2 w-2 rounded-full" style={{ background: SPORT_COLOR[r.sport] }} /><SelectValue /></SelectTrigger>
                              <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{SPORT_LABEL[s]}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={r.type} onValueChange={(v) => upd(r.key, { type: v as SessionType })}>
                              <SelectTrigger className="h-8 w-[124px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{SESSION_LABEL[t]}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min={5} max={720} className="h-8 w-[70px] text-xs" value={r.durationMin} onChange={(e) => upd(r.key, { durationMin: Math.max(5, Number(e.target.value) || 5) })} />
                            {r.estimated && <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[9px]" title="Duração estimada a partir da distância ou por omissão">estimado</Badge>}
                          </td>
                          <td className="px-2 py-1.5"><Input className="h-8 min-w-[180px] text-xs" value={r.title} onChange={(e) => upd(r.key, { title: e.target.value })} /></td>
                          <td className="max-w-[260px] px-2 py-1.5 text-[11px] text-muted-foreground">
                            <div className="line-clamp-3 whitespace-pre-wrap" title={r.description}>{r.description}</div>
                            <div className="pt-0.5 text-[10px]">{r.origin}</div>
                          </td>
                          <td className="px-2 py-1.5"><button className="rounded p-1 hover:bg-muted" aria-label="Retirar" onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}><Trash2 className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={replace} onCheckedChange={(c) => setReplace(!!c)} />
                Substituir os treinos já planeados nesses dias{existing.length ? ` (${existing.length})` : ""}
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
                <Button disabled={!chosen.length || busy === "save"} onClick={save}>{busy === "save" && <Loader2 className="animate-spin" />}Importar {chosen.length} treinos</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
