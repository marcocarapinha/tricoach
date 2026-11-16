import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useData } from "@/lib/data/DataProvider";
import { loginBackoffMs, PASSWORD_MIN, passwordIssues } from "@/lib/password";
import { PasswordRules } from "@/components/auth/PasswordRules";
import { Turnstile, TURNSTILE_SITE_KEY, type TurnstileHandle } from "@/components/auth/Turnstile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Layout";

const FAIL_KEY = "tricoach.loginFailures";

export default function LoginPage() {
  const { useDemo } = useData();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  // espera progressiva depois de falhas (o limite a sério é o do servidor: [auth.rate_limit])
  const [failures, setFailures] = useState(() => Number(sessionStorage.getItem(FAIL_KEY) ?? 0));
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waitUntil]);
  const waitS = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const issues = mode === "up" ? passwordIssues(pw, email) : [];
  const needCaptcha = !!TURNSTILE_SITE_KEY && !captcha;

  const fail = (msg: string) => {
    const n = failures + 1;
    setFailures(n);
    sessionStorage.setItem(FAIL_KEY, String(n));
    setWaitUntil(Date.now() + loginBackoffMs(n));
    setNow(Date.now());
    toast.error(msg);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (waitS || needCaptcha || issues.length) return;
    setBusy(true);
    const options = captcha ? { captchaToken: captcha } : {};
    const res = mode === "in"
      ? await supabase!.auth.signInWithPassword({ email, password: pw, options })
      : await supabase!.auth.signUp({ email, password: pw, options: { ...options, emailRedirectTo: location.origin } });
    setBusy(false);
    captchaRef.current?.reset(); // cada token do captcha só serve uma vez
    if (res.error) {
      const m = res.error.message;
      const status = (res.error as { status?: number }).status;
      if (status === 429) fail("Demasiadas tentativas. Aguarde alguns minutos e tente de novo.");
      else if (/invalid login credentials/i.test(m)) fail("Email ou palavra-passe incorretos.");
      else if (/email not confirmed/i.test(m)) toast.error("Confirme primeiro o email (veja a sua caixa de correio).");
      else fail(m);
      return;
    }
    setFailures(0);
    sessionStorage.removeItem(FAIL_KEY);
    if (mode === "up") {
      toast.success(res.data.session ? "Conta criada." : "Conta criada. Abra o email de confirmação para ativar a conta.");
      return;
    }
    // a palavra-passe é anterior às regras atuais → sugerir alteração
    const weak = (res.data as { weakPassword?: { reasons?: string[] } | null }).weakPassword;
    if (weak?.reasons?.length) toast.warning("A sua palavra-passe já não cumpre as regras de segurança. Altere-a em Definições → Segurança.", { duration: 10000 });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo />
          <CardTitle className="pt-3 text-lg">{mode === "in" ? "Entrar" : "Criar conta"}</CardTitle>
          <CardDescription>Os seus dados Garmin ficam só na sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw">Palavra-passe</Label>
              <Input id="pw" type="password" required minLength={mode === "up" ? PASSWORD_MIN : undefined}
                autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            {mode === "up" && <PasswordRules value={pw} />}
            {mode === "up" && issues.includes("Não pode conter o seu email") && <p className="text-xs text-bad">A palavra-passe não pode conter o seu email.</p>}
            <Turnstile ref={captchaRef} onToken={setCaptcha} />
            <Button className="w-full" disabled={busy || waitS > 0 || needCaptcha || issues.length > 0}>
              {busy && <Loader2 className="animate-spin" />}
              {waitS ? `Aguarde ${waitS} s` : mode === "in" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-xs">
            <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMode(mode === "in" ? "up" : "in"); setPw(""); }}>{mode === "in" ? "Criar conta" : "Já tenho conta"}</button>
            <button className="text-primary hover:underline" onClick={useDemo}>Explorar em modo demo</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
