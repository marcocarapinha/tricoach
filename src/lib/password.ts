/** Regras de palavra-passe — iguais às do servidor (supabase/config.toml: minimum_password_length + password_requirements). */
export const PASSWORD_MIN = 10;

export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: "len", label: `Pelo menos ${PASSWORD_MIN} caracteres`, test: (pw) => pw.length >= PASSWORD_MIN },
  { id: "lower", label: "Uma letra minúscula", test: (pw) => /[a-z]/.test(pw) },
  { id: "upper", label: "Uma letra maiúscula", test: (pw) => /[A-Z]/.test(pw) },
  { id: "digit", label: "Um número", test: (pw) => /\d/.test(pw) },
];

export function passwordIssues(pw: string, email?: string): string[] {
  const out = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) out.push("Não pode conter o seu email");
  return out;
}

/** Espera (ms) depois de `failures` tentativas falhadas: 0, 0, 0, 5 s, 10 s, 20 s, 40 s, 60 s… */
export function loginBackoffMs(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(60_000, 5_000 * 2 ** (failures - 3));
}
