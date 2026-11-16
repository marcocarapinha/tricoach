# Monta o cenário local completo no Windows: Supabase (Docker) + Edge Function + app em http://localhost:6869
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$port = if ($env:PORT) { $env:PORT } else { "6869" }

Write-Host "▸ A verificar Docker…"
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Docker não está a correr. Abra o Docker Desktop e tente de novo."; exit 1 }

if (-not (Test-Path node_modules)) { Write-Host "▸ npm install…"; npm install }

Write-Host "▸ A arrancar o Supabase local (a primeira vez descarrega as imagens, pode demorar alguns minutos)…"
npx supabase start
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "▸ A aplicar a migração…"
npx supabase db reset --local --yes
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "▸ A escrever .env.local…"
$vars = @{}
npx supabase status -o env | ForEach-Object { if ($_ -match '^([A-Z_]+)="?([^"]*)"?$') { $vars[$matches[1]] = $matches[2] } }
$key = if ($vars["PUBLISHABLE_KEY"]) { $vars["PUBLISHABLE_KEY"] } else { $vars["ANON_KEY"] }
"VITE_SUPABASE_URL=$($vars['API_URL'])`nVITE_SUPABASE_PUBLISHABLE_KEY=$key" | Set-Content -Encoding utf8 .env.local

Write-Host "▸ Chaves VAPID para as notificações push…"
node scripts/vapid-keys.mjs

Write-Host "▸ A servir as Edge Functions (log em supabase\functions.log)…"
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx supabase functions serve > supabase\functions.log 2>&1"

Write-Host ""
Write-Host "✓ Pronto"
Write-Host "  App ............ http://localhost:$port"
Write-Host "  Supabase Studio  http://127.0.0.1:54323"
Write-Host "  Emails locais .. http://127.0.0.1:54324"
Write-Host "  Parar tudo ..... npm run local:down"
Write-Host ""
$env:PORT = $port
npm run dev
