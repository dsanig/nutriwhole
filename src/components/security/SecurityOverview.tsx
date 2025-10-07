import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { SecurityStatus } from "@/hooks/useSecurity";

interface SecurityOverviewProps {
  status: SecurityStatus;
}

const SecurityOverview = ({ status }: SecurityOverviewProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Estado de seguridad
        </CardTitle>
        <CardDescription>
          Revisa si tu cuenta cumple con los controles obligatorios.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <p className="text-xs uppercase text-muted-foreground">MFA obligatorio</p>
          {status.mfaRequired ? (
            <Badge variant="secondary">Aplicado</Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Inactivo
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">
            Todos los roles deben tener MFA habilitado para acceder a información sensible.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Sincronización Stripe</p>
          {status.stripeSyncedAt ? (
            <div className="space-y-1">
              <Badge variant="secondary">Sincronizado</Badge>
              <p className="text-xs text-muted-foreground">
                Última verificación: {new Date(status.stripeSyncedAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <Badge variant="outline">Pendiente</Badge>
          )}
          <p className="text-xs text-muted-foreground">
            Los beneficios premium se desbloquean cuando Stripe detecta MFA activo.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Última verificación</p>
          {status.lastVerifiedAt ? (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              {new Date(status.lastVerifiedAt).toLocaleString()}
            </div>
          ) : (
            <Badge variant="outline">Nunca</Badge>
          )}
          <p className="text-xs text-muted-foreground">
            Se registra cada vez que completas la verificación MFA o renuevas tu sesión.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Acceso premium</p>
          {status.premiumLocked ? (
            <Badge variant="destructive">Bloqueado</Badge>
          ) : (
            <Badge variant="secondary">Activo</Badge>
          )}
          <p className="text-xs text-muted-foreground">
            {status.premiumLocked
              ? status.premiumLockedReason ?? "Activa MFA para recuperar tus beneficios."
              : "Los contenidos y el coach con IA están disponibles."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityOverview;
