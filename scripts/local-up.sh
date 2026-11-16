#!/usr/bin/env bash
# Monta o cenário local completo: Supabase (Docker) + Edge Function + app em http://localhost:6869
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-6869}"

echo "▸ A verificar Docker…"
docker info >/dev/null 2>&1 || { echo "✗ Docker não está a correr. Abra o Docker Desktop e tente de novo."; exit 1; }

[ -d node_modules ] || { echo "▸ npm install…"; npm install; }

echo "▸ A arrancar o Supabase local (a primeira vez descarrega as imagens, pode demorar alguns minutos)…"
npx supabase start

echo "▸ A aplicar a migração…"
npx supabase db reset --local --yes

echo "▸ A escrever .env.local…"
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=')"
KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"
cat > .env.local <<ENV
VITE_SUPABASE_URL=${API_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${KEY}
ENV

echo "▸ Chaves VAPID para as notificações push…"
node scripts/vapid-keys.mjs

echo "▸ A servir as Edge Functions (log em supabase/functions.log)…"
pkill -f "supabase functions serve" 2>/dev/null || true
nohup npx supabase functions serve > supabase/functions.log 2>&1 &

cat <<MSG

✓ Pronto
  App ............ http://localhost:${PORT}
  Supabase Studio  http://127.0.0.1:54323   (tabelas, sync_log, utilizadores)
  Emails locais .. http://127.0.0.1:54324
  Parar tudo ..... npm run local:down

MSG
PORT="$PORT" npm run dev
