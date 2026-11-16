// Validação de endereços externos lidos pelo servidor (calendários .ics).
/** Só endereços públicos em https (webcal:// é convertido): evita pedidos a redes internas. */
export function normalizeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://")); } catch { throw new Error("Endereço inválido"); }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") throw new Error("O endereço tem de começar por https:// ou webcal://");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || !h.includes(".")
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) throw new Error("Endereço não permitido");
  return u;
}

