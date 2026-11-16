import { useEffect, useState } from "react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loginBackoffMs } from "@/lib/password";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Layout";

/** Segundo passo do login: código de 6 dígitos da app autenticadora. */
export default function MfaChallenge() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    supabase!.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) { toast.error(error.message); return; }
      const f = data?.totp.find((x) => x.status === "verified");
      setFactorId(f?.id ?? null);
    });
  }, []);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waitUntil]);

  const waitS = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || waitS) return;
    setBusy(true);
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      const n = failures + 1;
      setFailures(n);
      setWaitUntil(Date.now() + loginBackoffMs(n));
      setNow(Date.now());
      setCode("");
      toast.error(error.message.toLowerCase().includes("invalid") ? "Código inválido ou expirado." : error.message);
    }
    // em caso de sucesso o Supabase emite MFA_CHALLENGE_VERIFIED e a app abre sozinha
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo />
          <CardTitle className="flex items-center gap-2 pt-3 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Verificação em dois passos</CardTitle>
          <CardDescription>Introduza o código de 6 dígitos da sua app autenticadora.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="mfa-code">Código</Label>
              <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
                className="text-center font-mono text-lg tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            <Button className="w-full" disabled={busy || !factorId || code.length !== 6 || waitS > 0}>
              {busy && <Loader2 className="animate-spin" />}{waitS ? `Aguarde ${waitS} s` : "Confirmar"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Perdeu acesso à app autenticadora? Peça ao administrador do projeto para remover o fator no painel do Supabase (Authentication → Users).</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => supabase!.auth.signOut()}><LogOut />Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
}
