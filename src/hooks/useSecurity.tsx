import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type ToastFn = ReturnType<typeof useToast>["toast"];

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

const disabledStatus: SecurityStatus = {
  mfaRequired: false,
  mfaEnrolled: false,
  lastVerifiedAt: null,
  stripeSyncedAt: null,
  premiumLocked: false,
  premiumLockedReason: null,
  devices: [],
  factors: [],
  backupCodes: [],
  passkeys: [],
  auditTrail: []
};

const disabledMessage = "La autenticación multifactor está deshabilitada temporalmente.";

const useDisabledMutation = (toast: ToastFn) =>
  useMutation({
    mutationFn: async () => {
      throw new Error(disabledMessage);
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Funcionalidad no disponible",
        description: disabledMessage
      });
    }
  });

export const useSecurityStatus = () => {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["security-status", "disabled"],
    queryFn: async () => disabledStatus,
    staleTime: Infinity
  });

  const startEnrollment = useDisabledMutation(toast);
  const confirmEnrollment = useDisabledMutation(toast);
  const enrollPasskey = useDisabledMutation(toast);
  const revokePasskey = useDisabledMutation(toast);
  const syncStripe = useDisabledMutation(toast);

  return {
    ...query,
    startEnrollment: startEnrollment.mutateAsync,
    confirmEnrollment: confirmEnrollment.mutateAsync,
    enrollPasskey: enrollPasskey.mutateAsync,
    revokePasskey: revokePasskey.mutateAsync,
    syncStripe: syncStripe.mutateAsync
  };
};
