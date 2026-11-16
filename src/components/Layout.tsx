import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Activity, BarChart3, CalendarRange, Dumbbell, Gauge, HeartPulse, LayoutDashboard, MoreHorizontal, Settings, Sun, TrendingUp, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useData } from "@/lib/data/DataProvider";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Hoje", icon: Sun, end: true },
  { to: "/plano", label: "Época e plano", icon: CalendarRange },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/estatisticas", label: "Estatísticas", icon: BarChart3 },
  { to: "/carga", label: "Carga e forma", icon: TrendingUp },
  { to: "/saude", label: "Saúde", icon: HeartPulse },
  { to: "/atividades", label: "Atividades", icon: Activity },
  { to: "/recordes", label: "Recordes", icon: Trophy },
  { to: "/exercicios", label: "Exercícios", icon: Dumbbell },
  { to: "/definicoes", label: "Definições", icon: Settings },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex -space-x-1">
        <span className="h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
        <span className="h-3 w-3 rounded-full bg-secondary ring-2 ring-background" />
        <span className="h-3 w-3 rounded-full bg-accent ring-2 ring-background" />
      </div>
      <span className="text-base font-semibold tracking-tight">TriCoach</span>
    </div>
  );
}

export default function Layout() {
  const { store, core } = useData();
  const location = useLocation();
  const outlet = useOutlet();
  const [more, setMore] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card/40 px-4 py-6 backdrop-blur md:flex">
        <div className="flex items-center justify-between px-2"><Logo /><ThemeToggle /></div>
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors", isActive ? "font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-md bg-primary/10" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <n.icon className="h-4 w-4" />{n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-xs text-muted-foreground">
          {store.mode === "demo" && <Badge variant="warn"><Gauge className="h-3 w-3" />Modo demo</Badge>}
          {core && <div>{core.profile.name} · {core.activities.length.toLocaleString("pt-PT")} atividades</div>}
        </div>
      </aside>
      <main className="px-5 pb-28 pt-6 md:ml-60 md:px-10 md:pb-12 md:pt-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-6 flex items-center justify-between md:hidden">
            <Logo />
            <div className="flex items-center gap-1">{store.mode === "demo" && <Badge variant="warn">Demo</Badge>}<ThemeToggle /></div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: "easeOut" }}>
              {outlet}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-card/90 py-2 backdrop-blur md:hidden">
        {NAV.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]", isActive ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" />{n.label.split(" ")[0]}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className={cn("flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]", NAV.slice(4).some((n) => location.pathname.startsWith(n.to)) ? "text-primary" : "text-muted-foreground")}>
          <MoreHorizontal className="h-5 w-5" />Mais
        </button>
      </nav>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Mais</DialogTitle></DialogHeader>
          <div className="grid gap-1">
            {NAV.slice(4).map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm", isActive ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>
                <n.icon className="h-4 w-4" />{n.label}
              </NavLink>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
