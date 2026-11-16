import { describe, it, expect } from "vitest";
import { detectSport, parseDistance, parseDuration, parseIcs, parseWorkoutText, icsEventToSessions } from "../../../supabase/functions/_shared/workout-text.ts";
import { dateOf, importSheets, parseCsv, weekdayOf } from "../coach-import";

const P = { runThresholdPace: 270, css: 100 };

describe("leitura de texto de treinos", () => {
  it("reconhece modalidades em PT e EN", () => {
    expect(detectSport("Natação 2000m")).toBe("swim");
    expect(detectSport("Rolo 1h Z2")).toBe("bike");
    expect(detectSport("Corrida 45' solto")).toBe("run");
    expect(detectSport("Easy run 40min")).toBe("run");
    expect(detectSport("Ginásio - força")).toBe("strength");
    expect(detectSport("Brick: bike 1h + run 20'")).toBe("brick");
  });
  it("lê durações e distâncias", () => {
    expect(parseDuration("Bike 1h30 Z2")).toBe(90);
    expect(parseDuration("Bike 2h")).toBe(120);
    expect(parseDuration("Corrida 45' solto")).toBe(45);
    expect(parseDuration("Run 50 min com 6x3min Z4")).toBe(50);
    expect(parseDuration("Planned Time: 1:15:00")).toBe(75);
    expect(parseDuration("Bike 1:30h")).toBe(90);
    expect(parseDistance("400 aq + 8x100 Z4 + 200 sol", "swim")).toBe(1400);
    expect(parseDistance("Natação 2.000m contínuos", "swim")).toBe(2000);
    expect(parseDistance("Corrida 12 km", "run")).toBe(12000);
  });
  it("divide células com várias sessões e ignora descanso", () => {
    const s = parseWorkoutText("Natação 2000m técnica\nCorrida 40' Z2", P);
    expect(s.map((x) => x.sport)).toEqual(["swim", "run"]);
    expect(s[0].type).toBe("technique");
    expect(s[0].estimated).toBe(true); // 2000 m a 1:52/100 m ≈ 37 min → 35
    expect(s[0].durationMin).toBe(35);
    expect(s[1].durationMin).toBe(40);
    expect(parseWorkoutText("Descanso", P)).toEqual([]);
    expect(parseWorkoutText("OFF", P)).toEqual([]);
  });
  it("classifica o tipo", () => {
    expect(parseWorkoutText("Bike 1h15 com 5x5min limiar", P)[0].type).toBe("intervals");
    expect(parseWorkoutText("Bike 3h30 Z2", P)[0].type).toBe("long");
    expect(parseWorkoutText("Corrida 30' recuperação", P)[0].type).toBe("recovery");
    expect(parseWorkoutText("Corrida 50' tempo", P)[0].type).toBe("tempo");
  });
});

describe("folhas de cálculo do treinador", () => {
  it("datas e dias da semana", () => {
    expect(weekdayOf("Segunda-feira")).toBe(0);
    expect(weekdayOf("SÁB")).toBe(5);
    expect(weekdayOf("Sunday")).toBe(6);
    expect(dateOf("17/11", "2026-11-16")).toBe("2026-11-17");
    expect(dateOf("05/01", "2026-11-16")).toBe("2027-01-05");
    expect(dateOf(new Date(Date.UTC(2026, 10, 20)))).toBe("2026-11-20");
  });
  it("grelha semanal com semanas sem data usa a data de início", () => {
    const rows = [
      ["Plano novembro"],
      ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
      ["Semana 1", "Descanso", "Natação 2000m", "Bike 1h Z2", "Corrida 45' + Natação 1500m", "Descanso", "Bike 3h", "Corrida 1h20 longo"],
      ["Semana 2", "", "Natação 2500m", "Bike 1h15 5x5' limiar", "Corrida 50'", "", "Brick: bike 2h + run 20'", "Corrida 1h30"],
    ];
    const r = importSheets([{ name: "Plano", rows }], P, "2026-11-23", "2026-11-16");
    expect(r.layout).toBe("grid");
    expect(r.usesStartDate).toBe(true);
    const w1 = r.sessions.filter((s) => s.date < "2026-11-30");
    expect(w1.map((s) => `${s.date} ${s.sport}`)).toEqual([
      "2026-11-24 swim", "2026-11-25 bike", "2026-11-26 run", "2026-11-26 swim", "2026-11-28 bike", "2026-11-29 run",
    ]);
    expect(r.sessions.find((s) => s.date === "2026-12-02")?.type).toBe("intervals");
    expect(r.sessions.find((s) => s.date === "2026-12-05")?.sport).toBe("brick");
  });
  it("lista com datas", () => {
    const rows = [["Data", "Modalidade", "Treino"], ["17/11/2026", "Natação", "3000m com 10x100"], ["18/11/2026", "Bike", "1h30 Z2"], ["19/11/2026", "Corrida", "45 min"], ["20/11/2026", "Descanso", ""]];
    const r = importSheets([{ name: "S", rows }], P, "2026-11-23", "2026-11-16");
    expect(r.layout).toBe("list");
    expect(r.sessions.map((s) => `${s.date} ${s.sport} ${s.durationMin}`)).toEqual(["2026-11-17 swim 55", "2026-11-18 bike 90", "2026-11-19 run 45"]);
  });
  it("grelha transposta (dias em linhas, semanas em colunas)", () => {
    const rows = [["", "23/11", "30/11"], ["Segunda", "Natação 2000m", "Natação 2200m"], ["Terça", "Bike 1h", ""], ["Quarta", "Corrida 40'", "Corrida 45'"], ["Quinta", "", "Bike 1h30"], ["Sexta", "OFF", "OFF"]];
    const r = importSheets([{ name: "S", rows }], P, "2026-11-23", "2026-11-16");
    expect(r.layout).toBe("grid-transposed");
    expect(r.sessions.map((s) => `${s.date} ${s.sport}`)).toEqual(["2026-11-23 swim", "2026-11-24 bike", "2026-11-25 run", "2026-11-30 swim", "2026-12-02 run", "2026-12-03 bike"]);
  });
  it("CSV com ponto e vírgula", () => {
    expect(parseCsv('a;b\n"x;y";2\n')).toEqual([["a", "b"], ["x;y", "2"]]);
  });
});

describe("calendário .ics", () => {
  const ics = [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:tp-1", "DTSTART;VALUE=DATE:20261118", "SUMMARY:Bike: Endurance", "DESCRIPTION:Planned Time: 1:30:00\\nZ2 steady",
    "END:VEVENT", "BEGIN:VEVENT", "UID:tp-2", "DTSTART:20261119T060000Z", "SUMMARY:Swim - CSS set", "DESCRIPTION:400 wu + 10x100 @CSS + 200 cd",
    "END:VEVENT", "BEGIN:VEVENT", "UID:tp-3", "DTSTART;VALUE=DATE:20261120", "SUMMARY:Day Off", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  it("lê eventos e converte em sessões", () => {
    const ev = parseIcs(ics);
    expect(ev.map((e) => e.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
    const a = icsEventToSessions(ev[0], P);
    expect(a[0]).toMatchObject({ sport: "bike", durationMin: 90 });
    const b = icsEventToSessions(ev[1], P);
    expect(b[0]).toMatchObject({ sport: "swim", distanceM: 1600, type: "intervals" });
    expect(icsEventToSessions(ev[2], P)).toEqual([]);
  });
});

import { placeSlots, generateWeek } from "../engine/plan";
import { weekSuggestions } from "../engine/functional";
import { DEFAULT_PROFILE } from "../types";

describe("dias de descanso", () => {
  it("o plano gerado não põe treinos nos dias de descanso e mantém o TSS", () => {
    const target = { weekStart: "2026-11-16", phase: "base", tss: 500, hours: 8, recoveryWeek: false } as any;
    const free = generateWeek(target, DEFAULT_PROFILE, []);
    const rest = generateWeek(target, DEFAULT_PROFILE, [], [0, 4]);
    expect(rest.some((s) => s.date === "2026-11-16" || s.date === "2026-11-20")).toBe(false);
    const tss = (xs: typeof free) => xs.reduce((a, s) => a + (s.tss ?? 0), 0);
    expect(Math.abs(tss(rest) - tss(free)) / tss(free)).toBeLessThan(0.12);
    expect(rest.every((s) => s.source === "app")).toBe(true);
  });
  it("move sessões para o dia livre mais próximo, até 2 por dia", () => {
    const out = placeSlots([[0, "swim", "technique", 1], [1, "bike", "endurance", 1]] as any, [0]);
    expect(out.map((x) => x[0])).toEqual([1, 1]);
  });
  it("funcional só nos dias de descanso escolhidos", () => {
    const planned = [
      { id: "1", date: "2026-11-17", sport: "bike", type: "endurance", durationMin: 60, title: "" },
      { id: "2", date: "2026-11-20", sport: "run", type: "recovery", durationMin: 30, title: "" },
    ] as any;
    const w = weekSuggestions(planned, [], "2026-11-16", 3, [0, 4]);
    expect(w.filter((d) => d.mode).map((d) => `${d.date}:${d.mode}`)).toEqual(["2026-11-16:full", "2026-11-20:short"]);
  });
});

import { normalizeUrl } from "../../../supabase/functions/_shared/url-guard.ts";
describe("endereço do calendário", () => {
  it("aceita webcal/https públicos e recusa endereços internos", () => {
    expect(normalizeUrl("webcal://www.trainingpeaks.com/ical/ABC.ics").toString()).toBe("https://www.trainingpeaks.com/ical/ABC.ics");
    for (const bad of ["http://localhost/x.ics", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://[::1]/a", "ftp://x.com/a", "https://intranet/a", "nada"]) expect(() => normalizeUrl(bad)).toThrow();
  });
});

describe("calendário genérico", () => {
  it("ignora eventos que não são treinos", () => {
    const ev = { uid: "x", date: "2026-11-20", summary: "Reunião de equipa", description: "Sala 2, 1h" };
    expect(icsEventToSessions(ev, P)).toEqual([]);
    expect(icsEventToSessions({ ...ev, summary: "Treino", description: "Corrida 40' Z2" }, P)[0].sport).toBe("run");
  });
});

import { importIcsFile } from "../coach-import";
describe("ficheiro .ics exportado", () => {
  it("importa só treinos a partir da data e com UID estável", () => {
    const ics = ["BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:a1", "DTSTART;VALUE=DATE:20261010", "SUMMARY:Corrida 40'", "END:VEVENT",
      "BEGIN:VEVENT", "UID:a2", "DTSTART;TZID=Europe/Lisbon:20261118T070000", "SUMMARY:Natação 2000m", "END:VEVENT",
      "BEGIN:VEVENT", "UID:a3", "DTSTART;VALUE=DATE:20261119", "SUMMARY:Dentista", "END:VEVENT",
      "END:VCALENDAR"].join("\r\n");
    const r = importIcsFile(ics, P, "2026-11-09");
    expect(r.layout).toBe("ics");
    expect(r.sessions.map((s) => `${s.date} ${s.sport} ${s.externalId}`)).toEqual(["2026-11-18 swim ics:a2"]);
    expect(r.warnings[0]).toMatch(/1 evento do calendário/);
    expect(() => importIcsFile("nada", P, "2026-11-09")).toThrow();
  });
});

import { assertIcloudHost, basicAuth, calendarQuery, parseCalendarData, parseCalendars, parseHrefProp } from "../../../supabase/functions/_shared/caldav.ts";
describe("CalDAV iCloud", () => {
  it("lê o principal e a pasta de calendários", () => {
    const p = `<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/1234567/principal/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
    expect(parseHrefProp(p, "current-user-principal")).toBe("/1234567/principal/");
    const h = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/1234567/principal/</d:href><d:propstat><d:prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p52-caldav.icloud.com:443/1234567/calendars/</href></calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>`;
    expect(parseHrefProp(h, "calendar-home-set")).toBe("https://p52-caldav.icloud.com:443/1234567/calendars/");
  });
  it("lista só calendários de eventos", () => {
    const x = `<multistatus xmlns="DAV:">
      <response><href>/1234567/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>
      <response><href>/1234567/calendars/home/</href><propstat><prop><displayname>Casa</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set><calendar-color xmlns="http://apple.com/ns/ical/">#34AADCFF</calendar-color></prop></propstat></response>
      <response><href>/1234567/calendars/treinos/</href><propstat><prop><displayname>Treinos &amp; provas</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set></prop></propstat></response>
      <response><href>/1234567/calendars/tasks/</href><propstat><prop><displayname>Lembretes</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VTODO"/></supported-calendar-component-set></prop></propstat></response>
      <response><href>/1234567/calendars/inbox/</href><propstat><prop><resourcetype><collection/><schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response>
    </multistatus>`;
    const c = parseCalendars(x, "https://p52-caldav.icloud.com:443/1234567/calendars/");
    expect(c).toEqual([
      { url: "https://p52-caldav.icloud.com/1234567/calendars/home/", name: "Casa", color: "#34AADC" },
      { url: "https://p52-caldav.icloud.com/1234567/calendars/treinos/", name: "Treinos & provas", color: null },
    ]);
  });
  it("junta os eventos do REPORT num .ics que o leitor entende", () => {
    const ev = (uid: string, d: string, s: string) => `BEGIN:VCALENDAR&#13;\nBEGIN:VEVENT&#13;\nUID:${uid}&#13;\nDTSTART:${d}&#13;\nSUMMARY:${s}&#13;\nEND:VEVENT&#13;\nEND:VCALENDAR`;
    const x = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/a.ics</href><propstat><prop><C:calendar-data>${ev("r1", "20261118T070000Z", "Natação 2000m")}</C:calendar-data></prop></propstat></response><response><href>/b.ics</href><propstat><prop><C:calendar-data><![CDATA[${ev("r1", "20261125T070000Z", "Natação 2000m").replace(/&#13;/g, "\r")}]]></C:calendar-data></prop></propstat></response></multistatus>`;
    const ev2 = parseIcs(parseCalendarData(x));
    expect(ev2.map((e) => `${e.uid} ${e.date} ${e.summary}`)).toEqual(["r1 2026-11-18 Natação 2000m", "r1 2026-11-25 Natação 2000m"]);
  });
  it("só envia credenciais para o iCloud", () => {
    expect(() => assertIcloudHost(new URL("https://p52-caldav.icloud.com/x"))).not.toThrow();
    expect(() => assertIcloudHost(new URL("https://evil.com/x"))).toThrow();
    expect(() => assertIcloudHost(new URL("https://icloud.com.evil.com/x"))).toThrow();
    expect(() => assertIcloudHost(new URL("http://caldav.icloud.com/x"))).toThrow();
    expect(basicAuth("a@b.pt", "abcd-efgh")).toBe("Basic " + Buffer.from("a@b.pt:abcd-efgh").toString("base64"));
    expect(calendarQuery(new Date("2026-11-09T00:00:00Z"), new Date("2027-01-08T00:00:00Z"))).toContain('<c:expand start="20261109T000000Z" end="20270108T000000Z"/>');
  });
});
