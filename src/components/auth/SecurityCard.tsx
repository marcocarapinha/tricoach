import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { passwordIssues } from "@/lib/password";
import { PasswordRules } from "./PasswordRules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Enroll = { factorId: string; qr: string; secret: string };

/** Definições → Segurança: 2FA (TOTP) opcional e alteração da palavra-passe. */
export function SecurityCard() {
  const qc = useQueryClient();
  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase!.auth.mfa.listFactors();
      if (error) throw error;
      return data.all.filter((f) => f.factor_type === "totp");
    },
  });
  const verified = factors.data?.find((f) => f.status === "verified");
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); qc.invalidateQueries({ queryKey: ["mfa-factors"] }); }
  };

  const start = () => run("enroll", async () => {
    // limpar tentativas anteriores que ficaram por confirmar
    for (const f of factors.data ?? []) if (f.status !== "verified") await supabase!.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase!.auth.mfa.enroll({ factorType: "totp", friendlyName: `TriCoach ${new Date().toISOString().slice(0, 10)}` });
    if (error) throw error;
    setCode("");
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  });

  const confirm = () => run("verify", async () => {
    if (!enroll) return;
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code: code.trim() });
    if (error) throw new Error(/invalid/i.test(error.message) ? "Código inválido. Confirme a hora do telemóvel e tente de novo." : error.message);
    setEnroll(null);
    toast.success("Autenticação de dois fatores ativada");
  });

  const cancel = () => run("cancel", async () => {
    if (enroll) await supabase!.auth.mfa.unenroll({ factorId: enroll.factorId });
    setEnroll(null);
  });

  const disable = () => run("disable", async () => {
    if (!verified) return;
    const { error } = await supabase!.auth.mfa.unenroll({ factorId: verified.id });
    if (error) throw error;
    await supabase!.auth.refreshSession();
    setConfirmOff(false);
    toast.success("Autenticação de dois fatores desativada");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Segurança</CardTitle>
        <CardDescription>Proteja a conta com um código da app autenticadora e uma palavra-passe forte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">Autenticação de dois fatores</div>
            {factors.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
              verified ? <Badge className="bg-good/15 text-good hover:bg-good/15">Ativa</Badge> : <Badge variant="outline">Desativada</Badge>}
          </div>
          {!enroll && (
            <p className="text-muted-foreground">
              {verified
                ? "Ao entrar, depois da palavra-passe, é pedido o código de 6 dígitos da app autenticadora."
                : "Opcional. Use uma app como Google Authenticator, Microsoft Authenticator, 1Password ou Authy."}
            </p>
          )}
          {!enroll && !verified && <Button variant="outline" onClick={start} disabled={!!busy}>{busy === "enroll" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Ativar 2FA</Button>}
          {!enroll && verified && <Button variant="outline" onClick={() => setConfirmOff(true)} disabled={!!busy}><ShieldOff />Desativar 2FA</Button>}

          {enroll && (
            <div className="space-y-3 rounded-lg border p-4">
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Leia o código QR com a app autenticadora.</li>
                <li>Introduza o código de 6 dígitos que a app mostrar.</li>
              </ol>
              <div className="flex justify-center"><img src={enroll.qr} alt="Código QR para a app autenticadora" className="h-44 w-44 rounded-md bg-white p-2" /></div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Não consegue ler o QR? Introduza esta chave na app:</Label>
                <code className="block break-all rounded bg-muted px-2 py-1.5 text-xs">{enroll.secret}</code>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="mfa-enroll-code">Código</Label>
                  <Input id="mfa-enroll-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-36 text-center font-mono tracking-[0.3em]"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </div>
                <Button onClick={confirm} disabled={code.length !== 6 || !!busy}>{busy === "verify" && <Loader2 className="animate-spin" />}Confirmar</Button>
                <Button variant="ghost" onClick={cancel} disabled={!!busy}>Cancelar</Button>
              </div>
            </div>
          )}
        </section>

        <ChangePassword />
      </CardContent>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar a autenticação de dois fatores?</DialogTitle>
            <DialogDescription>A conta passa a estar protegida só pela palavra-passe. Pode voltar a ativar quando quiser.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={disable} disabled={!!busy}>{busy === "disable" && <Loader2 className="animate-spin" />}Desativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [nonce, setNonce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const issues = passwordIssues(pw);
  const mismatch = pw2.length > 0 && pw !== pw2;

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase!.auth.updateUser(nonce ? { password: pw, nonce } : { password: pw });
      if (error) {
        // secure_password_change: sessões com mais de 24 h precisam de um código enviado por email
        if (/reauthenticat/i.test(error.message) || (error as { code?: string }).code === "reauthentication_needed") {
          const r = await supabase!.auth.reauthenticate();
          if (r.error) throw r.error;
          setNonce("");
          toast.info("Enviámos um código para o seu email. Introduza-o para confirmar a alteração.");
          return;
        }
        throw error;
      }
      setPw(""); setPw2(""); setNonce(null);
      toast.success("Palavra-passe alterada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" />Alterar palavra-passe</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="new-pw">Nova palavra-passe</Label><Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="new-pw2">Repetir</Label><Input id="new-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      </div>
      {pw && <PasswordRules value={pw} />}
      {mismatch && <p className="text-xs text-bad">As palavras-passe não coincidem.</p>}
      {nonce !== null && (
        <div className="space-y-1"><Label htmlFor="pw-nonce">Código recebido por email</Label><Input id="pw-nonce" className="w-40 font-mono" value={nonce} onChange={(e) => setNonce(e.target.value.trim())} /></div>
      )}
      <Button variant="outline" onClick={save} disabled={busy || !pw || issues.length > 0 || pw !== pw2 || (nonce !== null && !nonce)}>
        {busy && <Loader2 className="animate-spin" />}Guardar palavra-passe
      </Button>
    </section>
  );
}
