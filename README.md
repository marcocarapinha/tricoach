# TriCoach — Fase 1

App pessoal para triatletas: lê os dados da Garmin, calcula carga e prontidão e sugere o treino do dia. Inclui um dashboard drag & drop e estatísticas comparadas com N-1, N-2 e N-3.

Stack compatível com o Lovable: Vite + React 18 + TypeScript + Tailwind + shadcn/ui (Radix) + Supabase + Recharts + react-grid-layout.

## Correr localmente

**Só a app em modo demo** (precisa de Node 18+):

```bash
npm install
npm run dev        # http://localhost:6869
npm test           # testes do motor de cálculo (vitest)
```

**Cenário completo com Supabase local** (precisa de Node 18+ e Docker Desktop a correr):

```bash
npm run local:up        # macOS / Linux / Git Bash
npm run local:up:win    # Windows (PowerShell)
npm run local:down      # parar o Supabase
```

O script arranca o Supabase em Docker, aplica as migrações e escreve o `.env.local`. Depois serve a Edge Function `garmin-sync` e abre a app em **http://localhost:6869**. Crie conta na app (não é pedida confirmação de email localmente) e cole a chave Garmin em Definições.

| Serviço | Endereço |
| --- | --- |
| App | http://localhost:6869 |
| Supabase Studio (tabelas, `sync_log`) | http://127.0.0.1:54323 |
| API Supabase | http://127.0.0.1:54321 |
| Emails locais | http://127.0.0.1:54324 |

Outra porta: `PORT=7000 npm run local:up`.

Sem `.env`, a app arranca em **modo demo** com 4 anos de dados simulados. O cenário de hoje tem HRV a cair, FC de repouso a subir e duas noites curtas, para mostrar os alertas a funcionar. Os dashboards, as análises e o feedback das sugestões ficam no `localStorage`.

## Ligar aos dados reais (Supabase + Garmin)

1. Crie um projeto Supabase e aplique `supabase/migrations/20261113000000_tricoach_phase1.sql`. Esta migração cria as tabelas, a RLS, as funções do Vault e as vistas materializadas.
2. Publique a Edge Function: `supabase functions deploy garmin-sync`.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Crie conta na app e vá a **Definições → Ligação Garmin**. Cole a chave da *Personal API* (Garmin Connect Web → Personal API Key) e clique em **Importar histórico**.
5. (Opcional) Ative a sincronização de hora a hora: no fim da migração há um bloco `cron.schedule` comentado.

> Os endpoints e os campos seguem o [Swagger oficial da Personal API](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/). O resumo está em [docs/garmin-api.md](docs/garmin-api.md) e os mapeamentos em `supabase/functions/_shared/garmin-map.ts`, testados com exemplos do próprio Swagger. Só falta confirmar com uma conta real o formato da resposta do token, que não vem no Swagger. A janela do HRV também não está documentada e usamos 28 dias.

A Personal API serve para uso pessoal. Uma versão comercial com vários atletas exige o Garmin Connect Developer Program.

## Importar no Lovable

O zip não inclui `node_modules` nem `dist`. A estrutura segue a convenção do Lovable:

- `src/integrations/supabase/client.ts`
- `supabase/migrations`
- `supabase/functions`

Ao ligar o Supabase no Lovable, as variáveis `VITE_SUPABASE_*` ficam definidas e a app sai do modo demo.

## Design system

Ver [DESIGN.md](DESIGN.md): tokens de tema (índigo, violeta, ciano), Inter, radius 0.9rem, tema escuro com toggle, Framer Motion com reduced motion e gráficos com o Chart do shadcn.

## Estrutura

```
src/
  lib/
    engine/load.ts      TSS por atividade, CTL/ATL/TSB, rampa, zonas
    engine/health.ts    bases pessoais (7 d vs banda 60 d), prontidão 0–100, recomendação, 9 regras
    engine/stats.ts     métricas, dimensões, períodos homólogos, agregação 2 níveis, acumulado
    demo.ts             gerador determinístico de 4 anos de dados
    data/store.ts       Store com duas implementações: demo (localStorage) e Supabase
    data/defaults.ts    3 dashboards modelo (Diário, Época, Pré-prova)
  components/
    viz.tsx             gráficos (Recharts) e tabela comparativa
    widgets/registry.tsx  catálogo de 15 widgets + análise fixada; contrato { type, config, x, y, w, h }
  pages/                Hoje, Dashboard, Estatísticas, Carga e forma, Saúde, Atividades, Definições
supabase/
  migrations/           esquema, RLS, Vault, vistas materializadas, triggers
  functions/garmin-sync Edge Function: save-key, sync, backfill-step, status, cron
```

## Cálculos (resumo)

- **TSS**: usa o TSS da Garmin. Na falta dele, calcula por potência (ciclismo, NP/FTP), por ritmo (corrida vs limiar; natação vs CSS ao cubo), por FC (hrTSS) ou, em último caso, por duração.
- **CTL / ATL / TSB**: médias exponenciais de 42 e 7 dias. TSB = CTL − ATL do dia anterior.
- **Prontidão**: HRV (30%), sono (25%), TSB (20%), FC repouso (15%) e Body Battery/stress (10%). Pesos editáveis; os componentes em falta são renormalizados.
- **Comparação anual**: o período homólogo é o mesmo intervalo deslocado k anos. O YTD de N-1 é cortado no mesmo dia do ano. Anos sem dados aparecem como "sem dados", não como 0.

## Fase 2

| Funcionalidade | Onde | Como funciona |
| --- | --- | --- |
| Provas e periodização | Época e plano | As provas A geram a época: base → construção → pico → taper → prova → recuperação. As durações dependem da distância (`src/lib/engine/periodization.ts`). As B têm mini-taper; as C não mexem no plano. |
| Plano semanal | Época e plano | "Gerar semana" cria as sessões a partir da fase e da forma atual (CTL × 7 × fator da fase; descarga a cada 4.ª semana). Os passos e alvos (W, ritmo, CSS) vêm do perfil. Todas as sessões são editáveis. |
| Planeado vs realizado | Época e plano, widget | Cada sessão é emparelhada com a atividade do mesmo dia e modalidade: feito (≥ 70% da duração), parcial ou falhado. Mostra o cumprimento de sessões, volume e TSS. |
| Exportação FIT | Sessões, Hoje | Gera um ficheiro `.fit` de treino estruturado (`src/lib/engine/fit-workout.ts`). Importe-o no Garmin Connect → Treinos → Importar e envie-o para o relógio. |
| Detalhe de atividade | Atividades → clique | Função `garmin-activity`: descarrega o FIT da Garmin (`download-service`), reamostra a 5 s e guarda em `activity_streams`. Mostra gráfico FC/potência/ritmo, voltas, zonas, NP/IF, desacoplamento aeróbio e treinos semelhantes (eficiência). |
| Recordes | Recordes | `fastestSplit_*` e `maxAvgPower_*` de cada atividade. Mostra o melhor de sempre e de cada ano (N a N-3) e a curva de potência. |
| Check-in subjetivo | Hoje | Energia, dores, humor e motivação (1–5). Entram na prontidão como "Sensações" (peso editável). |
| Notificações | Definições | Service worker + Web Push. A função `notify` (cron de hora a hora) envia o resumo diário à hora local escolhida: alertas de HRV, FC de repouso e sono, mais o treino planeado. O `local:up` gera as chaves VAPID. |

Para produção, defina nas Edge Functions os segredos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`, e na app `VITE_VAPID_PUBLIC_KEY`. Ative também o cron no fim de `supabase/migrations/20261114000000_tricoach_phase2.sql`.

## Treino funcional

Em **Definições → Perfil do atleta → Treino funcional**, indique:
- as zonas problemáticas por ordem de prioridade, das 12 disponíveis (Aquiles, gémeos, pé, posterior da coxa, joelho, anca, adutores, lombar, core, ombros, pescoço, tornozelo);
- o nível;
- o material disponível.

A página **Hoje** mostra a rotina do dia e a página **Época e plano** marca os dias sugeridos:

| Dia | Sugestão |
| --- | --- |
| Descanso | Rotina completa (~25–35 min): mobilidade + exercícios para até 4 zonas (2 nas duas primeiras, 1 nas restantes) + core. Até 3 por semana, nunca em dias seguidos. |
| Leve | Rotina curta (~10–15 min) de ativação e isometria, se houver menos de 2 dias de descanso. |
| Duro, prova, véspera de prova | Nada (mobilidade opcional). |
| Véspera de séries ou de longo de corrida | Sem excêntricos pesados (ex.: descidas de gémeos, Nordic); só isometria e ativação. |
| Prontidão baixa | Só mobilidade. |

A biblioteca (`src/lib/engine/functional.ts`) tem 50 exercícios, cada um com ilustração (posição inicial → final), com doses por nível e instruções. Os exercícios rodam entre sessões. As ilustrações são desenhadas em código (`src/components/figures`): uma figura esquemática com comprimentos fixos, poses definidas por ângulos e o material (degrau, elástico, banco, parede) nas cores do tema. A página **Exercícios** mostra a biblioteca com filtros por zona. A rotina pode ser marcada como feita (tabela `functional_log`), juntada ao plano como sessão "Força · Funcional" ou exportada em FIT.

## Publicação (Vercel + Supabase)

- **Supabase:** projeto `tricoach` (ref `macbjkbtgpumoqecncbu`, região eu-west-3). Migrações aplicadas, Edge Functions publicadas e agendamentos ativos: `tricoach-garmin-sync` ao minuto 7 de cada hora e `tricoach-notify` ao minuto 15.
- **Vercel:** projeto `tricoach` (Vite, `npm run build`, pasta `dist`), com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` definidos. O `vercel.json` trata das rotas da app e dos cabeçalhos de segurança (HSTS, `frame-ancestors`, `nosniff`).
- **Agendamentos:** o pg_cron chama as funções com o cabeçalho `x-cron-secret`, um segredo gerado na base de dados e guardado no Vault. Nenhuma chave fica escrita em SQL. Para os voltar a criar noutro projeto: `select public.tricoach_schedule_jobs('https://<ref>.supabase.co');`
- **Chaves:** as Edge Functions usam as chaves novas (`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`). Só recorrem às chaves legadas quando as novas não existem, porque as legadas deixam de funcionar no fim de 2026.
- **Notificações:** os segredos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` são definidos em Edge Functions → Secrets. A app obtém a chave pública através da função `notify`, por isso não é preciso pô-la no Vercel.

## Segurança

| Tema | Como está resolvido |
|---|---|
| Sessão | Guardada em `sessionStorage` (apaga-se ao fechar o separador). Token de acesso de 1 h e tokens de renovação de uso único. O build inclui uma Content-Security-Policy que só permite scripts do próprio site, o que reduz o risco de XSS. |
| Autorização | Feita só no servidor: RLS em todas as tabelas (`auth.uid() = user_id`), chave Garmin no Vault, Edge Functions com `verify_jwt` e `getUser()`. A app não tem papel de administrador. |
| 2FA | Opcional, com app autenticadora (TOTP), em **Definições → Segurança**. Quem o ativa precisa de sessão `aal2` para ler ou escrever dados: políticas RLS *restrictive* com `public.mfa_ok()` e a mesma verificação nas Edge Functions (`_shared/auth.ts`). |
| Rate limiting | Servidor: 10 logins/registos e 15 verificações de código por IP a cada 5 min (`[auth.rate_limit]`). Cliente: espera progressiva após 3 falhas. Sincronização Garmin manual: no máximo 1 por minuto. Captcha Turnstile opcional (`VITE_TURNSTILE_SITE_KEY` + `[auth.captcha]`). |
| Palavras-passe | Mínimo 10 caracteres, com minúscula, maiúscula e número, validado no servidor e mostrado no formulário. Confirmação de email obrigatória. Alterar a palavra-passe numa sessão com mais de 24 h pede um código por email. |

**Em produção** (Supabase alojado ou Lovable Cloud), o `config.toml` não é aplicado: replique no painel, em **Authentication**, as opções de palavra-passe, rate limits, confirmação de email, MFA (TOTP) e captcha. Ative também a proteção contra palavras-passe expostas em fugas de dados, disponível nos planos pagos.

Localmente, os emails de confirmação ficam no Mailpit: http://127.0.0.1:54324.

## Fora da Fase 2

Coach IA (conversa sobre os dados, resumo semanal, revisão pós-prova) e ajuste automático dos limiares a partir do feedback "Seguir/Ignorar".
