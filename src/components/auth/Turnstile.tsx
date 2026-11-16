import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";

/**
 * Captcha Cloudflare Turnstile (opcional). Só aparece quando VITE_TURNSTILE_SITE_KEY está definido;
 * o Supabase Auth valida o token no servidor ([auth.captcha] no config.toml / painel Authentication).
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("Não foi possível carregar o captcha")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle { reset: () => void }

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (t: string | null) => void }>(function Turnstile({ onToken }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const { theme } = useTheme();
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({ reset: () => { if (id.current && window.turnstile) window.turnstile.reset(id.current); cb.current(null); } }), []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let alive = true;
    loadScript().then(() => {
      if (!alive || !el.current || !window.turnstile) return;
      id.current = window.turnstile.render(el.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: theme === "dark" ? "dark" : "light",
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => { alive = false; if (id.current && window.turnstile) window.turnstile.remove(id.current); id.current = null; };
  }, [theme]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={el} className="flex min-h-[65px] justify-center" />;
});
