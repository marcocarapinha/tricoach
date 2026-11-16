// Cliente HTTP da Garmin Connect Personal API (Deno / Edge Functions).
// Endpoints, janelas e mapeamentos em ./garmin-map.ts, de acordo com o Swagger oficial:
// https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
import { ACTIVITY_PAGE_SIZE, type DataType, ENDPOINTS, buildUrl, parseTokenResponse } from "./garmin-map.ts";

export * from "./garmin-map.ts";

export const GARMIN_BASE = Deno.env.get("GARMIN_BASE_URL") ?? "https://personal.connectapi.garmin.com";
export const TOKEN_URL = `${GARMIN_BASE}/personalapitoken-service/personal-api/personal-api-key/token`;

export async function getAccessToken(apiKey: string): Promise<{ token: string; expiresAt: string }> {
  // Igual ao exemplo oficial: só o cabeçalho Authorization. Um "Accept: application/json" dá 406 Not Acceptable.
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `ApiKey ${apiKey}`, Accept: "*/*" } });
  const body = await r.text();
  if (!r.ok) throw new Error(`Token Garmin recusado (${r.status}): ${body.slice(0, 200)}`);
  return parseTokenResponse(body);
}

async function getJson(url: string, token: string, label: string): Promise<any> {
  let accept = "application/json";
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept } });
    if (r.status === 406 && accept !== "*/*") { accept = "*/*"; continue; }
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt)); continue; }
    if (r.status === 204 || r.status === 404) return null; // sem dados nesse intervalo
    if (!r.ok) throw new Error(`${label}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${label}: demasiados pedidos (429)`);
}

/** Lê uma janela (≤ maxDays do tipo). As atividades são paginadas e incluem as pernas dos multidesportos. */
export async function fetchRange(token: string, type: DataType, from: string, to: string): Promise<any[]> {
  const ep = ENDPOINTS[type];
  const label = `${type} ${from}..${to}`;
  if (type !== "activities") return ep.unwrap(await getJson(buildUrl(GARMIN_BASE, type, from, to), token, label));
  const all: any[] = [];
  for (let start = 0; ; start += ACTIVITY_PAGE_SIZE) {
    const page = ep.unwrap(await getJson(buildUrl(GARMIN_BASE, type, from, to, { start, limit: ACTIVITY_PAGE_SIZE, excludeChildren: false, sortOrder: "asc" }), token, label));
    all.push(...page);
    if (page.length < ACTIVITY_PAGE_SIZE || start > 5000) break;
  }
  return all;
}
