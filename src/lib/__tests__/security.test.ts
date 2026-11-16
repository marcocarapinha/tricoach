import { describe, it, expect } from "vitest";
import { loginBackoffMs, passwordIssues } from "../password";

describe("regras de palavra-passe", () => {
  it("rejeita passwords fracas e aceita uma forte", () => {
    expect(passwordIssues("abc")).toHaveLength(3); // tamanho, maiúscula, número
    expect(passwordIssues("abcdefghij")).toEqual(["Uma letra maiúscula", "Um número"]);
    expect(passwordIssues("Triatlo2027x")).toEqual([]);
  });
  it("não aceita o email dentro da password", () => {
    expect(passwordIssues("Marco12345X", "marco@exemplo.pt")).toContain("Não pode conter o seu email");
  });
  it("espera cresce depois de 3 falhas e tem teto de 60 s", () => {
    expect([0, 1, 2].map(loginBackoffMs)).toEqual([0, 0, 0]);
    expect(loginBackoffMs(3)).toBe(5000);
    expect(loginBackoffMs(4)).toBe(10000);
    expect(loginBackoffMs(20)).toBe(60000);
  });
});

import { cssFromTests, fmtMmSs, ftpFrom20min, ftpFromLevel, hrMaxFromAge, lthrFromHrMax, parseMmSs, thresholdPaceFrom10k } from "../onboarding";

describe("estimativas do assistente inicial", () => {
  it("lê e formata mm:ss", () => {
    expect(parseMmSs("4:15")).toBe(255);
    expect(parseMmSs("95")).toBe(95);
    expect(parseMmSs("4:75")).toBeNull();
    expect(parseMmSs("")).toBeNull();
    expect(fmtMmSs(255)).toBe("4:15");
  });
  it("calcula FC, FTP, limiar de corrida e CSS", () => {
    expect(hrMaxFromAge(40)).toBe(180);
    expect(lthrFromHrMax(180)).toBe(160);
    expect(ftpFromLevel(72, "intermediate")).toBe(215);
    expect(ftpFrom20min(280)).toBe(266);
    expect(thresholdPaceFrom10k(45 * 60)).toBe(281); // 4:30/km → 4:41/km
    expect(cssFromTests(6 * 60 + 40, 3 * 60 + 10)).toBe(105); // 1:45/100 m
  });
});
