import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import type { MfaFactor, BackupCode, PasskeySummary } from "@/hooks/useSecurity";

interface TwoFactorEnrollmentProps {
  factors: MfaFactor[];
  backupCodes: BackupCode[];
  passkeys: PasskeySummary[];
  onStartEnrollment: (payload: { friendlyName: string }) => Promise<{ secret: string; otpauthUrl: string }>;
  onConfirmEnrollment: (payload: { code: string; deviceName?: string }) => Promise<{ backupCodes: string[] }>;
  onEnrollPasskey: (payload: { friendlyName?: string }) => Promise<void>;
  onRevokePasskey: (payload: { passkeyId: string }) => Promise<void>;
  onStatusChange: () => void;
}

const formatSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

const TwoFactorEnrollment = ({
  factors,
  backupCodes,
  passkeys,
  onStartEnrollment,
  onConfirmEnrollment,
  onEnrollPasskey,
  onRevokePasskey,
  onStatusChange
}: TwoFactorEnrollmentProps) => {
  const { toast } = useToast();
  const totpFactor = useMemo(() => factors.find((factor) => factor.factor_type === "totp"), [factors]);
  const activeBackupHints = useMemo(
    () => backupCodes.filter((codeItem) => !codeItem.consumed),
    [backupCodes]
  );

  const [friendlyName, setFriendlyName] = useState(totpFactor?.friendly_name ?? "NutriWhole");
  const [deviceLabel, setDeviceLabel] = useState("Mi dispositivo principal");
  const [code, setCode] = useState("");
  const [enrollmentSecret, setEnrollmentSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [revealedBackupCodes, setRevealedBackupCodes] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState("Passkey principal");
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  useEffect(() => {
    setFriendlyName(totpFactor?.friendly_name ?? "NutriWhole");
  }, [totpFactor?.friendly_name]);

  const handleStart = async () => {
    try {
      setProcessing(true);
      const payload = await onStartEnrollment({ friendlyName });
      setEnrollmentSecret(payload.secret);
      setOtpauthUrl(payload.otpauthUrl);
      setRevealedBackupCodes([]);
      setCode("");
      toast({
        title: "Secreto generado",
        description: "Escanea el QR o ingresa la clave manualmente en tu app de autenticación"
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo generar la clave",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (code.length !== 6) {
      toast({
        variant: "destructive",
        title: "Código inválido",
        description: "Introduce el código de 6 dígitos mostrado en tu app"
      });
      return;
    }

    try {
      setProcessing(true);
      const { backupCodes: newCodes } = await onConfirmEnrollment({ code, deviceName: deviceLabel });
      setEnrollmentSecret(null);
      setOtpauthUrl(null);
      setRevealedBackupCodes(newCodes);
      setCode("");
      onStatusChange();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo activar MFA",
        description: error instanceof Error ? error.message : "Verifica el código e intenta nuevamente"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handlePasskeyEnrollment = async () => {
    try {
      setRegisteringPasskey(true);
      await onEnrollPasskey({ friendlyName: passkeyLabel.trim() || undefined });
      setPasskeyLabel("Passkey principal");
      onStatusChange();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo registrar la passkey",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handlePasskeyRevoke = async (passkeyId: string) => {
    try {
      await onRevokePasskey({ passkeyId });
      onStatusChange();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo revocar la passkey",
        description: error instanceof Error ? error.message : "Vuelve a intentarlo"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autenticación en dos pasos</CardTitle>
        <CardDescription>
          Protege tu cuenta con un segundo factor. Requerimos MFA para mantener el acceso a beneficios premium y al coach con IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {totpFactor?.confirmed_at ? (
          <Badge variant="secondary">2FA activo</Badge>
        ) : (
          <Badge variant="outline">Pendiente de activación</Badge>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="factor-name">
              Nombre en la app de autenticación
            </label>
            <Input
              id="factor-name"
              value={friendlyName}
              onChange={(event) => setFriendlyName(event.target.value)}
              placeholder="Ej. NutriWhole"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="device-name">
              Etiqueta para el dispositivo de confianza
            </label>
            <Input
              id="device-name"
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              placeholder="Ej. iPhone de Ana"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Genera un código secreto y agrégalo a Google Authenticator, Authy, 1Password o cualquier app compatible con TOTP.
            </p>
            <Button variant="outline" size="sm" onClick={handleStart} disabled={processing}>
              {totpFactor?.confirmed_at ? "Regenerar código" : "Generar código"}
            </Button>
          </div>
          {otpauthUrl && (
            <a
              href={otpauthUrl}
              className="text-sm text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              Abrir enlace OTP (si tu app lo permite)
            </a>
          )}
          {enrollmentSecret && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs uppercase text-muted-foreground">Clave secreta</p>
              <p className="font-mono text-lg tracking-widest break-all">{formatSecret(enrollmentSecret)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Ingresa esta clave manualmente en tu app si no puedes escanear un código QR.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Código de 6 dígitos</p>
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((slot) => (
                <InputOTPSlot key={slot} index={slot} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <p className="text-xs text-muted-foreground">
            Introduce el código mostrado en tu app para confirmar que quedó enlazada.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={handleConfirm} disabled={processing}>
            Confirmar activación
          </Button>
          {totpFactor?.confirmed_at && activeBackupHints.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Última verificación: {new Date(totpFactor.confirmed_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Códigos de respaldo</p>
              <p className="text-xs text-muted-foreground">
                Cada código funciona una única vez. Úsalos si pierdes tu app o tu dispositivo de confianza.
              </p>
            </div>
            {revealedBackupCodes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(revealedBackupCodes.join("\n"))}
              >
                Copiar
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(revealedBackupCodes.length > 0
              ? revealedBackupCodes
              : activeBackupHints.map((item) => `••••-${item.code_hint ?? "????"}`)
            ).map((value, index) => (
              <code key={index} className="rounded bg-background px-3 py-2 text-sm">
                {value}
              </code>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">Passkeys / Llaves de acceso</h3>
              <p className="text-sm text-muted-foreground">
                Usa una passkey compatible (Face ID, Touch ID, Windows Hello o llaves FIDO2) como segundo factor sin códigos.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={passkeyLabel}
                onChange={(event) => setPasskeyLabel(event.target.value)}
                placeholder="Nombre de la passkey"
                className="w-48"
                disabled={registeringPasskey}
              />
              <Button onClick={handlePasskeyEnrollment} disabled={registeringPasskey}>
                {registeringPasskey ? "Registrando..." : "Registrar passkey"}
              </Button>
            </div>
          </div>

          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes passkeys registradas.</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{passkey.friendly_name ?? "Passkey"}</p>
                    <p className="text-xs text-muted-foreground">
                      Registrada el {new Date(passkey.created_at).toLocaleString()} • Último uso:
                      {passkey.last_used_at ? ` ${new Date(passkey.last_used_at).toLocaleString()}` : " sin registros"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handlePasskeyRevoke(passkey.id)}>
                    Revocar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TwoFactorEnrollment;
