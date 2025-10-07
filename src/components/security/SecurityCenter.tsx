import SecurityOverview from "@/components/security/SecurityOverview";
import TwoFactorEnrollment from "@/components/security/TwoFactorEnrollment";
import TrustedDevices from "@/components/security/TrustedDevices";
import SecurityAuditTimeline from "@/components/security/SecurityAuditTimeline";
import { useSecurityStatus } from "@/hooks/useSecurity";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const SecurityCenter = () => {
  const { user } = useAuth();
  const {
    data,
    isLoading,
    isError,
    refetch,
    startEnrollment,
    confirmEnrollment,
    enrollPasskey,
    revokePasskey,
    syncStripe
  } = useSecurityStatus();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="grid gap-4">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data || !user) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>No se pudo cargar la configuración de seguridad</AlertTitle>
        <AlertDescription>
          Intenta refrescar la página o contacta al equipo de soporte si el problema persiste.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <SecurityOverview status={data} />
      {!data.stripeSyncedAt && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Sincroniza con Stripe</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Marca tu cuenta como segura en Stripe para mantener el acceso a beneficios premium como el coach con IA.
            </span>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await syncStripe();
                  refetch();
                } catch (error) {
                  console.error(error);
                  toast({
                    variant: "destructive",
                    title: "No se pudo sincronizar",
                    description: error instanceof Error ? error.message : "Inténtalo nuevamente"
                  });
                }
              }}
            >
              Registrar sincronización
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <TwoFactorEnrollment
        factors={data.factors}
        backupCodes={data.backupCodes}
        passkeys={data.passkeys}
        onStartEnrollment={startEnrollment}
        onConfirmEnrollment={confirmEnrollment}
        onEnrollPasskey={enrollPasskey}
        onRevokePasskey={revokePasskey}
        onStatusChange={refetch}
      />
      <TrustedDevices userId={user.id} devices={data.devices} onStatusChange={refetch} />
      <SecurityAuditTimeline auditTrail={data.auditTrail} />
    </div>
  );
};

export default SecurityCenter;
