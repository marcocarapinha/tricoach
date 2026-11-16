// Gera as chaves VAPID das notificações push.
//   supabase/functions/.env  → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (Edge Functions)
//   .env.local               → VITE_VAPID_PUBLIC_KEY (app); as restantes linhas mantêm-se
// Uso: npm run vapid            (só cria se ainda não existirem)
//      npm run vapid -- --force (gera chaves novas; é preciso reativar as notificações no browser)
import fs from "node:fs";
import webpush from "web-push";

const FN_ENV = "supabase/functions/.env";
const APP_ENV = ".env.local";
const force = process.argv.includes("--force");

const readEnv = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const getVar = (text, name) => text.split(/\r?\n/).find((l) => l.startsWith(name + "="))?.slice(name.length + 1).trim();
const setVar = (text, name, value) =>
  [...text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith(name + "=")), `${name}=${value}`].join("\n") + "\n";

let fnEnv = readEnv(FN_ENV);
let pub = getVar(fnEnv, "VAPID_PUBLIC_KEY");

if (force || !pub || !getVar(fnEnv, "VAPID_PRIVATE_KEY")) {
  const k = webpush.generateVAPIDKeys();
  pub = k.publicKey;
  fnEnv = setVar(fnEnv, "VAPID_PUBLIC_KEY", k.publicKey);
  fnEnv = setVar(fnEnv, "VAPID_PRIVATE_KEY", k.privateKey);
  if (!getVar(fnEnv, "VAPID_SUBJECT")) fnEnv = setVar(fnEnv, "VAPID_SUBJECT", "mailto:tricoach@localhost");
  fs.mkdirSync("supabase/functions", { recursive: true });
  fs.writeFileSync(FN_ENV, fnEnv);
  console.log("✔ Chaves VAPID criadas em " + FN_ENV);
} else {
  console.log("✔ Chaves VAPID já existem em " + FN_ENV);
}

fs.writeFileSync(APP_ENV, setVar(readEnv(APP_ENV), "VITE_VAPID_PUBLIC_KEY", pub));
console.log("✔ VITE_VAPID_PUBLIC_KEY atualizada em " + APP_ENV);
console.log("→ Reinicie 'npx supabase functions serve' e 'npm run dev', e reative as notificações nas Definições.");
