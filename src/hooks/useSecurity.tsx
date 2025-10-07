import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fingerprintDevice } from "@/lib/security";
import { useToast } from "@/hooks/use-toast";

export interface TrustedDevice {
  id: string;
  device_fingerprint: string;
  display_name: string | null;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface MfaFactor {
  id: string;
  factor_type: "totp" | "passkey";
  friendly_name: string | null;
  confirmed_at: string | null;
}

export interface SessionAuditLog {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BackupCode {
  id: string;
  consumed: boolean;
  consumed_at: string | null;
  code_hint: string | null;
}

export interface PasskeySummary {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  sign_count: number;
  transports: string[] | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityStatus {
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  lastVerifiedAt?: string | null;
  stripeSyncedAt?: string | null;
  premiumLocked: boolean;
  premiumLockedReason?: string | null;
  devices: TrustedDevice[];
  factors: MfaFactor[];
  backupCodes: BackupCode[];
  passkeys: PasskeySummary[];
  auditTrail: SessionAuditLog[];
}

const getSecurityStatus = async (userId: string): Promise<SecurityStatus> => {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "mfa_required, mfa_enrolled, mfa_verified_at, stripe_mfa_synced_at, premium_locked, premium_locked_reason"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const { data: devices, error: deviceError } = await supabase
    .from("trusted_devices")
    .select("id, device_fingerprint, display_name, last_seen_at, revoked_at")
    .order("last_seen_at", { ascending: false });

  if (deviceError) {
    throw deviceError;
  }

  const { data: factors, error: factorError } = await supabase
    .from("mfa_factor_summaries")
    .select("id, factor_type, friendly_name, confirmed_at")
    .order("created_at", { ascending: true });

  if (factorError) {
    throw factorError;
  }

  const { data: codes, error: codesError } = await supabase
    .from("mfa_backup_code_status")
    .select("id, consumed, consumed_at, code_hint")
    .order("created_at", { ascending: true });

  if (codesError) {
    throw codesError;
  }

  const { data: passkeys, error: passkeyError } = await supabase
    .from("mfa_passkey_summaries")
    .select("id, credential_id, friendly_name, sign_count, transports, last_used_at, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (passkeyError) {
    throw passkeyError;
  }

  const { data: auditTrail, error: auditError } = await supabase
    .from("session_audit_logs")
    .select("id, event_type, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (auditError) {
    throw auditError;
  }

  return {
    mfaRequired: profile?.mfa_required ?? true,
    mfaEnrolled: profile?.mfa_enrolled ?? false,
    lastVerifiedAt: profile?.mfa_verified_at ?? null,
    stripeSyncedAt: profile?.stripe_mfa_synced_at ?? null,
    premiumLocked: profile?.premium_locked ?? false,
    premiumLockedReason: profile?.premium_locked_reason ?? null,
    devices: devices ?? [],
    factors: factors ?? [],
    backupCodes: codes ?? [],
    passkeys: passkeys ?? [],
    auditTrail: auditTrail ?? []
  };
};

export const useSecurityStatus = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["security-status", user?.id],
    queryFn: () => {
      if (!user?.id) {
        throw new Error("No authenticated user available");
      }
      return getSecurityStatus(user.id);
    },
    enabled: Boolean(user?.id)
  });

  const startEnrollment = useMutation({
    mutationFn: async ({ friendlyName }: { friendlyName: string }) => {
      const { data, error } = await supabase.functions.invoke("mfa-start", {
        body: { friendlyName }
      });
      if (error) throw new Error(error.message);
      return data as { secret: string; otpauthUrl: string };
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo iniciar la configuración",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const confirmEnrollment = useMutation({
    mutationFn: async ({
      code,
      deviceName
    }: {
      code: string;
      deviceName?: string;
    }) => {
      const deviceFingerprint = fingerprintDevice();
      const { data, error } = await supabase.functions.invoke("mfa-confirm", {
        body: { code, deviceFingerprint, deviceName }
      });
      if (error) throw new Error(error.message);
      return data as { backupCodes: string[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-status", user?.id] });
      toast({
        title: "MFA activado",
        description: "Guarda tus códigos de respaldo en un lugar seguro"
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo confirmar",
        description: error instanceof Error ? error.message : "Verifica el código e intenta de nuevo"
      });
    }
  });

  const enrollPasskey = useMutation({
    mutationFn: async ({ friendlyName }: { friendlyName?: string }) => {
      const { data, error } = await supabase.functions.invoke("mfa-passkey-start", {
        body: { friendlyName: friendlyName ?? "Passkey" }
      });
      if (error) throw new Error(error.message);
      const options = (data as { options?: Record<string, unknown> })?.options;
      if (!options) {
        throw new Error("No se pudo generar el desafío para passkey");
      }
      const attestation = await startRegistration(options as never);
      const { error: finishError } = await supabase.functions.invoke("mfa-passkey-finish", {
        body: { friendlyName, attestation }
      });
      if (finishError) throw new Error(finishError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-status", user?.id] });
      toast({
        title: "Passkey registrada",
        description: "Tu passkey quedó disponible como segundo factor"
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo registrar la passkey",
        description: error instanceof Error ? error.message : "Vuelve a intentarlo"
      });
    }
  });

  const revokePasskey = useMutation({
    mutationFn: async ({ passkeyId }: { passkeyId: string }) => {
      const { error } = await supabase.functions.invoke("mfa-passkey-revoke", {
        body: { passkeyId }
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-status", user?.id] });
      toast({
        title: "Passkey revocada",
        description: "El dispositivo ya no podrá aprobar MFA"
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo revocar la passkey",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const syncStripe = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("mfa-sync-stripe", { body: {} });
      if (error) throw new Error(error.message);
      return data as { synced: boolean; customerId?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-status", user?.id] });
      toast({
        title: "Stripe actualizado",
        description: "La cuenta quedó marcada como segura para beneficios premium"
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo sincronizar con Stripe",
        description: error instanceof Error ? error.message : "Revisa la configuración e inténtalo nuevamente"
      });
    }
  });

  return {
    ...query,
    startEnrollment: startEnrollment.mutateAsync,
    confirmEnrollment: confirmEnrollment.mutateAsync,
    enrollPasskey: enrollPasskey.mutateAsync,
    revokePasskey: revokePasskey.mutateAsync,
    syncStripe: syncStripe.mutateAsync
  };
};
