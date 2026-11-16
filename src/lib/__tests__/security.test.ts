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
