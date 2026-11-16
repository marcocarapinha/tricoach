import type { Store } from "./data/store";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* sem SW (ex.: http fora de localhost) */ }); });
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Pede permissão e, com Supabase + chave VAPID, regista a subscrição push no servidor. */
export async function enablePush(store: Store): Promise<"push" | "local"> {
  if (!pushSupported()) throw new Error("Este browser não suporta notificações. No iPhone, instale a app no ecrã principal (Partilhar → Adicionar ao ecrã principal).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificações recusada no browser.");
  const reg = await navigator.serviceWorker.ready;
  if (store.mode !== "supabase") return "local";
  // chave do build (local) ou a do servidor (produção: só existe nos segredos das Edge Functions)
  const key = VAPID || (await store.vapidPublicKey?.()) || "";
  if (!key) return "local";
  const appKey = b64ToBytes(key);
  let sub = await reg.pushManager.getSubscription();
  // subscrição antiga feita com outra chave → não serve: substituir
  const old = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  if (sub && old && (old.length !== appKey.length || old.some((b, i) => b !== appKey[i]))) {
    await store.deletePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  const json = sub.toJSON() as any;
  await store.savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return "push";
}

export async function disablePush(store: Store) {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await store.deletePushSubscription(sub.endpoint); await sub.unsubscribe(); }
}
