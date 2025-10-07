import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TrustedDevice } from "@/hooks/useSecurity";
import { fingerprintDevice } from "@/lib/security";

interface TrustedDevicesProps {
  userId: string;
  devices: TrustedDevice[];
  onStatusChange: () => void;
}

const TrustedDevices = ({ userId, devices, onStatusChange }: TrustedDevicesProps) => {
  const { toast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);

  const currentFingerprint = useMemo(() => fingerprintDevice(), []);

  const currentDevice = devices.find((device) => device.device_fingerprint === currentFingerprint && !device.revoked_at);

  const registerDevice = async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      setIsRegistering(true);
      const payload = {
        user_id: userId,
        device_fingerprint: currentFingerprint,
        display_name: `${window.navigator.platform ?? "Dispositivo"} (${window.navigator.language})`,
        last_seen_at: new Date().toISOString(),
        revoked_at: null
      };

      const { error } = await supabase.from("trusted_devices").upsert(payload, { onConflict: "user_id,device_fingerprint" });
      if (error) throw error;

      await supabase.rpc("record_session_event", {
        p_event_type: "device_registered",
        p_metadata: { fingerprint: currentFingerprint }
      });

      toast({
        title: "Dispositivo confiable registrado",
        description: "No solicitaremos 2FA en este dispositivo salvo que lo revokes."
      });
      onStatusChange();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo registrar",
        description: error instanceof Error ? error.message : "Intenta de nuevo"
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const revokeDevice = async (id: string) => {
    try {
      const { error } = await supabase
        .from("trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      await supabase.rpc("record_session_event", {
        p_event_type: "device_revoked",
        p_metadata: { device_id: id }
      });

      toast({
        title: "Dispositivo revocado",
        description: "Este equipo volverá a requerir 2FA en el próximo acceso."
      });
      onStatusChange();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo revocar",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispositivos de confianza</CardTitle>
        <CardDescription>Gestiona los equipos que pueden omitir la verificación 2FA.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {currentDevice ? (
            <Badge variant="secondary">Este dispositivo está marcado como confiable</Badge>
          ) : (
            <Badge variant="outline">Este dispositivo pedirá 2FA</Badge>
          )}
          <Button onClick={registerDevice} disabled={isRegistering || Boolean(currentDevice)}>
            {currentDevice ? "Ya registrado" : "Confiar en este dispositivo"}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => (
              <TableRow key={device.id}>
                <TableCell>{device.display_name ?? "Dispositivo"}</TableCell>
                <TableCell>{new Date(device.last_seen_at).toLocaleString()}</TableCell>
                <TableCell>
                  {device.revoked_at ? (
                    <Badge variant="outline">Revocado</Badge>
                  ) : (
                    <Badge variant="secondary">Activo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!device.revoked_at && (
                    <Button variant="ghost" size="sm" onClick={() => revokeDevice(device.id)}>
                      Revocar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Aún no hay dispositivos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default TrustedDevices;
