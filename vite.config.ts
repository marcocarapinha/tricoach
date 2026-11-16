import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Content-Security-Policy no build (em desenvolvimento o Vite precisa de scripts inline para o HMR).
 * Só permite scripts do próprio site (e do captcha, se estiver configurado) e ligações ao Supabase.
 * Domínios extra (ex.: o script do alojamento) podem ser acrescentados com VITE_CSP_EXTRA_CONNECT / VITE_CSP_EXTRA_SCRIPT.
 */
function csp(env: Record<string, string>): Plugin {
  const origin = (u?: string) => { try { return u ? new URL(u).origin : ""; } catch { return ""; } };
  const sb = origin(env.VITE_SUPABASE_URL);
  const sbWs = sb.replace(/^http/, "ws");
  const turnstile = env.VITE_TURNSTILE_SITE_KEY ? "https://challenges.cloudflare.com" : "";
  const list = (...xs: (string | undefined)[]) => xs.flatMap((x) => (x ?? "").split(/[\s,]+/)).filter(Boolean).join(" ");
  const policy = [
    "default-src 'self'",
    `script-src ${list("'self'", turnstile, env.VITE_CSP_EXTRA_SCRIPT)}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${list("'self'", sb, sbWs, "https://*.supabase.co", "wss://*.supabase.co", env.VITE_CSP_EXTRA_CONNECT)}`,
    `frame-src ${list("'self'", turnstile)}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "tricoach-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    server: { host: true, port: Number(process.env.PORT ?? 6869), strictPort: true },
    preview: { port: Number(process.env.PORT ?? 6869), strictPort: true },
    plugins: [react(), csp(env)],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    test: { environment: "node" },
  } as any;
});
