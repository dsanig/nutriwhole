import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SessionAuditLog } from "@/hooks/useSecurity";

interface SecurityAuditTimelineProps {
  auditTrail: SessionAuditLog[];
}

const eventLabels: Record<string, string> = {
  mfa_enrolled: "Activación de MFA",
  device_registered: "Dispositivo confiable",
  device_revoked: "Dispositivo revocado",
  session_timeout: "Sesión cerrada por inactividad"
};

const SecurityAuditTimeline = ({ auditTrail }: SecurityAuditTimelineProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bitácora de seguridad</CardTitle>
        <CardDescription>
          Últimos eventos relevantes para la protección de tu cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {auditTrail.map((event) => (
            <div key={event.id} className="flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{eventLabels[event.event_type] ?? event.event_type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </div>
              <pre className="whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs text-muted-foreground">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          ))}
          {auditTrail.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay eventos recientes. Las acciones de seguridad aparecerán aquí.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityAuditTimeline;
