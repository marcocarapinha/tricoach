# Design system — TriCoach

Regras para qualquer alteração ao projeto (também para o Lovable):

- **Base**: shadcn/ui + Radix. Usar sempre os componentes de `src/components/ui` antes de criar novos.
- **Cores**: só tokens de tema definidos em `src/index.css` (claro em `:root`, escuro em `.dark`). Nunca hex/hsl fixos nos componentes. Usar classes Tailwind (`bg-primary`, `text-accent`…) ou `hsl(var(--token))`.
  - `--primary` índigo · `--secondary` violeta · `--accent` ciano
  - Superfícies de hover: `bg-muted` (o `accent` é cor de marca, não fundo neutro)
  - Dados: `--swim --bike --run --brick --strength`, `--zone-1..5`, `--year-0..3` (ano atual → N-3), `--ctl --atl`, `--good --warn --bad`, `--chart-1..5`
- **Tipografia**: Inter (`@fontsource-variable/inter`). Números com a classe `num` (algarismos tabulares).
- **Forma**: `--radius: 0.9rem`. Muito espaço em branco: cards com `p-6`, grelhas com `gap-6`, cabeçalhos de página com `mb-8`.
- **Tema**: escuro por defeito, com toggle claro/escuro (`ThemeProvider` + `ThemeToggle`, guardado em `localStorage`).
- **Animação**: Framer Motion, discreta (≤ 0,5 s, deslocações ≤ 12 px). A app está envolvida em `<MotionConfig reducedMotion="user">`. As animações CSS têm regra `@media (prefers-reduced-motion: reduce)`.
- **Ícones**: Lucide.
- **Gráficos**: componente Chart do shadcn (`src/components/ui/chart.tsx`, Recharts). Cores no `ChartConfig` a apontar para tokens; nas séries usar `var(--color-<chave>)`.
- **Efeitos**: `src/components/effects/AuroraBackground.tsx`, o fundo aurora do hero da página Hoje. Usa `--primary`, `--secondary`, `--accent` e `--background`.
