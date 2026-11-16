import React, { useEffect, useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, GripVertical, LayoutGrid, Pencil, Plus, RotateCcw, Search, Settings2, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/lib/data/DataProvider";
import { WIDGETS, WIDGET, type WidgetDef } from "@/components/widgets/registry";
import { WidgetConfigDialog } from "@/components/widgets/WidgetConfigDialog";
import { defaultDashboards } from "@/lib/data/defaults";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common";
import type { Dashboard, DashboardWidget, LayoutItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const Grid = WidthProvider(Responsive);
const COLS = { lg: 12, md: 6, sm: 1 };
const BREAKPOINTS = { lg: 1100, md: 640, sm: 0 };
const uid = () => Math.random().toString(36).slice(2, 9);

class WidgetBoundary extends React.Component<{ children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? <div className="text-xs text-bad">Erro a desenhar este widget. Reveja a configuração.</div> : this.props.children; }
}

export default function DashboardPage() {
  const { store } = useData();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboards", store.mode], queryFn: () => store.listDashboards() });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Dashboard | null>(null);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [configW, setConfigW] = useState<DashboardWidget | null>(null);
  const [rename, setRename] = useState<{ mode: "new" | "rename"; name: string } | null>(null);
  const [dropType, setDropType] = useState<string | null>(null);
  const [bp, setBp] = useState<"lg" | "md" | "sm">("lg");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveTimer = useRef<number>();

  const list = q.data ?? [];
  const current = draft ?? list.find((d) => d.id === activeId) ?? list.find((d) => d.isDefault) ?? list[0];

  useEffect(() => { if (current && !activeId) setActiveId(current.id); }, [current, activeId]);

  const persist = (d: Dashboard, immediate = false) => {
    setDraft(d);
    window.clearTimeout(saveTimer.current);
    const run = async () => {
      const saved = await store.saveDashboard(d);
      qc.setQueryData<Dashboard[]>(["dashboards", store.mode], (old) => {
        const xs = (old ?? []).map((x) => (d.isDefault ? { ...x, isDefault: false } : x));
        const i = xs.findIndex((x) => x.id === d.id || x.id === saved.id);
        if (i >= 0) xs[i] = saved; else xs.push(saved);
        return xs;
      });
      if (saved.id !== d.id) { setActiveId(saved.id); setDraft({ ...d, id: saved.id }); }
    };
    if (immediate) run(); else saveTimer.current = window.setTimeout(run, 600);
  };

  const layouts: Layouts = useMemo(() => {
    if (!current) return {} as Layouts;
    const lg = current.layouts.lg as Layout[];
    return {
      lg,
      md: (current.layouts.md?.length === lg.length ? current.layouts.md : deriveLayout(lg, 6)) as Layout[],
      sm: (current.layouts.sm?.length === lg.length ? current.layouts.sm : deriveLayout(lg, 1)) as Layout[],
    };
  }, [current]);

  if (!current) return <div className="text-sm text-muted-foreground">A carregar dashboards…</div>;

  const withMinSizes = (items: Layout[]) => items.map((it) => {
    const w = current.widgets.find((x) => x.i === it.i);
    const def = w && WIDGET[w.type];
    return { ...it, minW: bp === "sm" ? 1 : Math.min(def?.size.minW ?? 2, COLS[bp]), minH: def?.size.minH ?? 2 };
  });

  const addWidget = (def: WidgetDef, pos?: { x: number; y: number }) => {
    const i = `${def.type}-${uid()}`;
    const maxY = current.layouts.lg.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const item: LayoutItem = { i, x: pos?.x ?? 0, y: pos?.y ?? maxY, w: def.size.w, h: def.size.h };
    persist({ ...current, widgets: [...current.widgets, { i, type: def.type, config: { ...def.defaults } }], layouts: { lg: [...current.layouts.lg, item] } });
    setCatalog(false);
    toast.success(`${def.label} adicionado`);
  };

  const removeWidget = (i: string) => persist({
    ...current,
    widgets: current.widgets.filter((w) => w.i !== i),
    layouts: Object.fromEntries(Object.entries(current.layouts).map(([k, v]) => [k, (v ?? []).filter((l) => l.i !== i)])) as Dashboard["layouts"],
  });

  const onLayoutChange = (_l: Layout[], all: Layouts) => {
    if (!editing) return;
    const strip = (xs?: Layout[]) => xs?.filter((l) => l.i !== "__dropping-elem__").map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    const next = { lg: strip(all.lg) ?? current.layouts.lg, md: strip(all.md), sm: strip(all.sm) };
    if (JSON.stringify(next) !== JSON.stringify(current.layouts)) persist({ ...current, layouts: next as Dashboard["layouts"] });
  };

  const switchTo = (id: string) => { setDraft(null); setActiveId(id); };

  const createDashboard = async (name: string) => {
    const d: Dashboard = { id: `new-${uid()}`, name, isDefault: false, widgets: [], layouts: { lg: [] } };
    const saved = await store.saveDashboard(d);
    qc.setQueryData<Dashboard[]>(["dashboards", store.mode], (old) => [...(old ?? []), saved]);
    setDraft(null); setActiveId(saved.id); setEditing(true); setCatalog(true);
  };

  const duplicate = async () => {
    const d: Dashboard = { ...current, id: `new-${uid()}`, name: `${current.name} (cópia)`, isDefault: false };
    const saved = await store.saveDashboard(d);
    qc.setQueryData<Dashboard[]>(["dashboards", store.mode], (old) => [...(old ?? []), saved]);
    switchTo(saved.id);
    toast.success("Dashboard duplicado");
  };

  const remove = async () => {
    if (list.length <= 1) return toast.error("Tem de existir pelo menos um dashboard.");
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
    await store.deleteDashboard(current.id);
    qc.setQueryData<Dashboard[]>(["dashboards", store.mode], (old) => (old ?? []).filter((x) => x.id !== current.id));
    setDraft(null); setActiveId(list.find((x) => x.id !== current.id)!.id); setConfirmDelete(false);
  };
  const resetTemplate = () => {
    const tpl = defaultDashboards().find((t) => t.name === current.name) ?? defaultDashboards()[0];
    persist({ ...current, widgets: tpl.widgets, layouts: tpl.layouts }, true);
    toast.success("Layout reposto");
  };

  const dropDef = dropType ? WIDGET[dropType] : null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={editing ? "Arraste pelo título para mover, pelo canto para redimensionar, ou arraste widgets do catálogo para a grelha." : "O seu painel. Use “Editar” para o personalizar."}
        actions={
          <>
            <Select value={current.id} onValueChange={switchTo}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{list.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.isDefault ? " ★" : ""}</SelectItem>)}</SelectContent>
            </Select>
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setCatalog(true)}><Plus />Widget</Button>
                <Button variant="ghost" size="icon" title="Renomear" onClick={() => setRename({ mode: "rename", name: current.name })}><Pencil /></Button>
                <Button variant="ghost" size="icon" title="Definir como predefinido" onClick={() => persist({ ...current, isDefault: true }, true)}><Star className={cn(current.isDefault && "fill-primary text-primary")} /></Button>
                <Button variant="ghost" size="icon" title="Duplicar" onClick={duplicate}><Copy /></Button>
                <Button variant="ghost" size="icon" title="Repor modelo" onClick={resetTemplate}><RotateCcw /></Button>
                <Button variant={confirmDelete ? "destructive" : "ghost"} size={confirmDelete ? "sm" : "icon"} title="Apagar" onClick={remove}><Trash2 />{confirmDelete && "Confirmar"}</Button>
                <Button onClick={() => { persist(current, true); setEditing(false); setCatalog(false); }}><Check />Concluir</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setRename({ mode: "new", name: "" })}><Plus />Novo</Button>
                <Button variant="outline" onClick={() => setEditing(true)}><LayoutGrid />Editar</Button>
              </>
            )}
          </>
        }
      />

      <div className="flex gap-4">
        <div className={cn("min-w-0 flex-1 rounded-xl transition-colors", editing && "bg-muted/20 outline outline-1 outline-dashed outline-border")}>
          {current.widgets.length === 0 && (
            <div className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              Dashboard vazio.
              <Button onClick={() => { setEditing(true); setCatalog(true); }}><Plus />Adicionar widgets</Button>
            </div>
          )}
          <Grid
            className={cn("layout", editing && "is-editing")}
            layouts={{ ...layouts, [bp]: withMinSizes((layouts[bp] ?? layouts.lg ?? []) as Layout[]) }}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={40}
            margin={[16, 16]}
            containerPadding={[editing ? 8 : 0, editing ? 8 : 0]}
            isDraggable={editing}
            isResizable={editing}
            isDroppable={editing && !!dropDef}
            droppingItem={dropDef ? { i: "__dropping-elem__", w: dropDef.size.w, h: dropDef.size.h } : undefined}
            onDrop={(_l, item) => { if (dropDef && item) addWidget(dropDef, { x: item.x, y: item.y }); setDropType(null); }}
            draggableHandle=".drag-handle"
            onBreakpointChange={(b) => setBp(b as any)}
            onLayoutChange={onLayoutChange}
            compactType="vertical"
          >
            {current.widgets.map((w) => {
              const def = WIDGET[w.type];
              const title = w.config.title || def?.title?.({ ...def.defaults, ...w.config }) || def?.label || w.type;
              return (
                <div key={w.i}>
                  <Card className={cn("flex h-full flex-col overflow-hidden", editing && "ring-1 ring-primary/20")}>
                    <div className={cn("flex items-center gap-1 px-4 pt-3", editing && "drag-handle cursor-move")}>
                      {editing && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
                      {editing && (
                        <div className="ml-auto flex shrink-0 gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
                          {def && <button className="rounded p-1 hover:bg-muted" title="Configurar" onClick={() => setConfigW(w)}><Settings2 className="h-3.5 w-3.5" /></button>}
                          <button className="rounded p-1 hover:bg-muted" title="Remover" onClick={() => removeWidget(w.i)}><X className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4 pt-2">
                      <WidgetBoundary>{def ? <def.Component config={{ ...def.defaults, ...w.config }} /> : <span className="text-xs text-muted-foreground">Widget desconhecido</span>}</WidgetBoundary>
                    </div>
                  </Card>
                </div>
              );
            })}
          </Grid>
        </div>

        {editing && catalog && <Catalog onAdd={addWidget} onClose={() => setCatalog(false)} onDragType={setDropType} />}
      </div>

      <WidgetConfigDialog widget={configW} onClose={() => setConfigW(null)} onSave={(nw) => persist({ ...current, widgets: current.widgets.map((x) => (x.i === nw.i ? nw : x)) }, true)} />

      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{rename?.mode === "new" ? "Novo dashboard" : "Renomear dashboard"}</DialogTitle></DialogHeader>
          <Input autoFocus value={rename?.name ?? ""} placeholder="Ex.: Semana de prova" onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.form as any)?.requestSubmit?.()} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRename(null)}>Cancelar</Button>
            <Button disabled={!rename?.name.trim()} onClick={() => {
              const n = rename!.name.trim();
              if (rename!.mode === "new") createDashboard(n); else persist({ ...current, name: n }, true);
              setRename(null);
            }}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Gera um layout para menos colunas a partir do layout desktop, mantendo a ordem de leitura. */
function deriveLayout(lg: Layout[], cols: number): LayoutItem[] {
  const sorted = [...lg].sort((a, b) => a.y - b.y || a.x - b.x);
  if (cols === 1) { let y = 0; return sorted.map((l) => { const it = { i: l.i, x: 0, y, w: 1, h: l.h }; y += l.h; return it; }); }
  const heights = new Array(cols).fill(0);
  return sorted.map((l) => {
    const w = l.w >= 6 ? cols : Math.max(1, Math.round(cols / 2));
    let bestX = 0, bestY = Infinity;
    for (let x = 0; x + w <= cols; x += w) { const y = Math.max(...heights.slice(x, x + w)); if (y < bestY) { bestY = y; bestX = x; } }
    for (let k = bestX; k < bestX + w; k++) heights[k] = bestY + l.h;
    return { i: l.i, x: bestX, y: bestY, w, h: l.h };
  });
}

function Catalog({ onAdd, onClose, onDragType }: { onAdd: (d: WidgetDef) => void; onClose: () => void; onDragType: (t: string | null) => void }) {
  const [q, setQ] = useState("");
  const items = WIDGETS.filter((w) => !w.hidden && (w.label + w.description + w.category).toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(items.map((w) => w.category))];
  return (
    <aside className="fixed bottom-4 right-4 top-4 z-40 hidden w-72 flex-col overflow-hidden rounded-lg border bg-card shadow-2xl shadow-black/50 md:flex">
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-semibold">Catálogo de widgets</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="relative p-3">
        <Search className="absolute left-5 top-5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-3 pb-3">
        {cats.map((c) => (
          <div key={c} className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c}</div>
            {items.filter((w) => w.category === c).map((w) => (
              <div
                key={w.type}
                draggable
                unselectable="on"
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", w.type); onDragType(w.type); }}
                onDragEnd={() => onDragType(null)}
                className="group flex cursor-grab items-start gap-2 rounded-md border bg-background p-2 hover:border-primary/50"
              >
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{w.label}</div>
                  <div className="text-[11px] text-muted-foreground">{w.description}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onAdd(w)}><Plus /></Button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t p-3 text-[11px] text-muted-foreground"><Badge variant="outline">Dica</Badge> Arraste para a posição exata ou use + para adicionar ao fim.</div>
    </aside>
  );
}
