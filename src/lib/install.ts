import { useSyncExternalStore } from "react";

/** Evento beforeinstallprompt (Chrome, Edge, Samsung Internet; não existe em Safari nem Firefox). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Chamar o mais cedo possível (main.tsx): o browser só emite o evento uma vez por carregamento. */
export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // mostramos o nosso botão em vez da barra do browser
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => { deferred = null; installedNow = true; emit(); });
}

export type InstallPlatform = "prompt" | "ios" | "ios-other" | "manual" | "installed";

function detect(): InstallPlatform {
  if (typeof window === "undefined") return "manual";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone || installedNow) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios";
  return "manual";
}

export function useInstall() {
  const platform = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, detect, () => "manual" as InstallPlatform);
  const install = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === "accepted") installedNow = true;
    emit();
    return outcome === "accepted";
  };
  return { platform, install };
}
