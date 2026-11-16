// CalDAV (RFC 4791) — o único acesso programático ao Calendário iCloud.
// Módulo puro: corpos dos pedidos e leitura das respostas multistatus (testado com Vitest).
// As credenciais (email da conta Apple + palavra-passe específica de app) só podem ir para *.icloud.com.

export const ICLOUD_CALDAV = "https://caldav.icloud.com/";

export interface CaldavConfig { type: "caldav"; server: string; username: string; password: string; calendarUrl: string; calendarName?: string }
export interface CaldavCalendar { url: string; name: string; color: string | null }

/** Só servidores iCloud recebem as credenciais. */
export function assertIcloudHost(u: URL) {
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !(h === "icloud.com" || h.endsWith(".icloud.com"))) throw new Error("Servidor CalDAV não permitido");
}

export function basicAuth(user: string, pass: string) {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "Basic " + btoa(bin);
}

export const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
export const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
export const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop></d:propfind>`;

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Eventos entre `from` e `to`; com `expand`, as repetições vêm como ocorrências separadas. */
export function calendarQuery(from: Date, to: Date, expand = true): string {
  const s = icsUtc(from), e = icsUtc(to);
  return `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data>${expand ? `<c:expand start="${s}" end="${e}"/>` : ""}</c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${s}" end="${e}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

// ── leitura de XML (multistatus) sem dependências: tira os prefixos de namespace e lê por expressões ──
const stripNs = (xml: string) => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, "<$1");
const unescapeXml = (s: string) => s
  .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&");
const tag = (block: string, name: string) => block.match(new RegExp(`<${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${name}>)`))?.[1];
const responses = (xml: string) => [...stripNs(xml).matchAll(/<response\b[^>]*>([\s\S]*?)<\/response>/g)].map((m) => m[1]);

/** href dentro de uma propriedade (current-user-principal, calendar-home-set). */
export function parseHrefProp(xml: string, prop: string): string | null {
  for (const r of responses(xml)) {
    const p = tag(r, prop);
    const href = p != null ? tag(p, "href") : undefined;
    if (href) return unescapeXml(href.trim());
  }
  return null;
}

/** Calendários com eventos (ignora listas de tarefas, caixas de entrada e afins). */
export function parseCalendars(xml: string, base: string): CaldavCalendar[] {
  const out: CaldavCalendar[] = [];
  for (const r of responses(xml)) {
    const href = tag(r, "href")?.trim();
    const rt = tag(r, "resourcetype") ?? "";
    if (!href || !/<calendar\b/.test(rt)) continue;
    const comps = tag(r, "supported-calendar-component-set");
    if (comps != null && comps.trim() && !/name="VEVENT"/i.test(comps)) continue;
    const name = unescapeXml((tag(r, "displayname") ?? "").trim()) || "Sem nome";
    const color = (tag(r, "calendar-color") ?? "").trim().slice(0, 7) || null;
    out.push({ url: new URL(unescapeXml(href), base).toString(), name, color });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Junta os calendar-data de um REPORT num único texto .ics. */
export function parseCalendarData(xml: string): string {
  const parts: string[] = [];
  for (const r of responses(xml)) {
    const d = tag(r, "calendar-data");
    if (d && d.includes("BEGIN:V")) parts.push(unescapeXml(d.trim()));
  }
  return parts.join("\r\n");
}
