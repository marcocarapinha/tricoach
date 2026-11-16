import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, BarChart3, LayoutDashboard } from "lucide-react";
import { Area, AreaChart, YAxis } from "recharts";
import { useLoaded } from "@/lib/data/DataProvider";
import { ComponentBars, ReadinessGauge, SuggestionCard, LEVEL_COLOR, LEVEL_LABEL } from "@/components/common";
import { AuroraBackground } from "@/components/effects/AuroraBackground";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { HealthTrend, LoadChart } from "@/components/viz";
import { WIDGET } from "@/components/widgets/registry";
import { CheckinCard, TodayPlanned } from "@/components/TodayPlan";
import { FunctionalCard } from "@/components/Functional";
import { fmtDatePt } from "@/lib/dates";
import { SPORT_LABEL } from "@/lib/types";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.45, ease: EASE } }),
};

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? "Boa noite" : h < 13 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite";
}

export default function TodayPage() {
  const { core, derived, statuses, setStatus } = useLoaded();
  const r = derived.readiness;
  const rec = derived.recommendation;
  const NextRace = WIDGET.nextRace.Component;
  const open = derived.suggestions.filter((s) => (statuses[s.id] ?? "new") === "new");
  const handled = derived.suggestions.filter((s) => (statuses[s.id] ?? "new") !== "new");
  const hist = derived.readinessHistory.map((h) => ({ date: h.date, score: h.score }));
  const sparkConfig = { score: { label: "Prontidão", color: LEVEL_COLOR[r.level] } } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      {/* ───────────── Hero ───────────── */}
      <AuroraBackground className="rounded-xl border">
        <div className="grid items-center gap-10 px-6 py-10 md:grid-cols-[1fr_auto] md:px-12 md:py-14">
          <div className="max-w-2xl space-y-5">
            <motion.p custom={0} variants={fadeUp} initial="hidden" animate="show" className="text-sm font-medium text-muted-foreground">
              {fmtDatePt(derived.today)}
            </motion.p>
            <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="show" className="text-3xl font-semibold tracking-tight md:text-5xl">
              {greeting()}, <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">{core.profile.name}</span>
            </motion.h1>
            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="space-y-2">
              <div className="flex items-center gap-2 text-lg font-medium md:text-xl">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[r.level] }} />
                {rec.title}
              </div>
              <p className="text-muted-foreground">{rec.detail}</p>
            </motion.div>
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg"><Link to="/dashboard"><LayoutDashboard />Abrir dashboard</Link></Button>
              <Button asChild size="lg" variant="outline" className="bg-background/40 backdrop-blur"><Link to="/estatisticas"><BarChart3 />Estatísticas<ArrowRight /></Link></Button>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: EASE }}
            className="mx-auto flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/50 p-6 backdrop-blur-md">
            <ReadinessGauge r={r} size={164} />
            <span className="text-xs text-muted-foreground">Prontidão hoje · {LEVEL_LABEL[r.level].toLowerCase()}</span>
          </motion.div>
        </div>
      </AuroraBackground>

      {/* ───────────── Conteúdo ───────────── */}
      <div className="grid gap-6 lg:grid-cols-12">
        <CheckinCard className="lg:col-span-4" />
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Treino planeado para hoje</CardTitle><CardDescription>Do plano semanal · exporte o FIT e importe-o no Garmin Connect</CardDescription></CardHeader>
          <CardContent><TodayPlanned /></CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Próxima prova</CardTitle></CardHeader>
          <CardContent><NextRace config={{}} /></CardContent>
        </Card>

        <FunctionalCard className="lg:col-span-12" />

        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Componentes da prontidão</CardTitle><CardDescription>Cada fator vs a sua base pessoal</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <ComponentBars r={r} />
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Últimos 30 dias</div>
              <ChartContainer config={sparkConfig} className="h-20">
                <AreaChart data={hist} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload ? fmtDatePt(p[0].payload.date) : "")} />} />
                  <Area dataKey="score" type="monotone" stroke="var(--color-score)" strokeWidth={2} fill="url(#spark)" />
                </AreaChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Porquê esta recomendação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              {rec.sport && <span className="rounded-full bg-muted px-3 py-1">{SPORT_LABEL[rec.sport]}</span>}
              {rec.durationMin[1] > 0 && <span className="rounded-full bg-muted px-3 py-1">{rec.durationMin[0]}–{rec.durationMin[1]} min</span>}
              <span className="rounded-full bg-muted px-3 py-1">{rec.zones}</span>
            </div>
            <ul className="space-y-2.5">
              {rec.reasons.map((x, i) => (
                <li key={x} className="flex gap-3 text-sm"><span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{i + 1}</span>{x}</li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Orientação de treino, não diagnóstico médico. Alertas persistentes justificam falar com um médico.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader><CardTitle>Alertas e sugestões ({open.length})</CardTitle><CardDescription>“Seguir”, “Ignorar” e “Não se aplica” ficam registados para afinar os limiares.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {open.length === 0 && <p className="text-sm text-muted-foreground">Nada pendente hoje.</p>}
            {[...open, ...handled].map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }}>
                <SuggestionCard s={s} status={statuses[s.id]} onStatus={(st) => setStatus(s, st)} />
              </motion.div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Forma, fadiga e frescura · 90 dias</CardTitle></CardHeader>
          <CardContent className="h-80"><LoadChart days={90} /></CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>HRV · 60 dias</CardTitle><CardDescription>Barras: noite · linha: média 7 dias · faixa: banda normal</CardDescription></CardHeader>
          <CardContent className="h-80"><HealthTrend metric="hrv" days={60} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
