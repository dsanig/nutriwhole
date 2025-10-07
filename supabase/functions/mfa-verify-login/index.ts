import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticator } from "https://esm.sh/otplib@12.0.1/authenticator?dts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { Session } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  generateBackupCodes,
  getServiceSupabase,
  hashValue,
  syncStripeMfaState,
  consumeWebauthnChallenge,
  getPasskeyCredentials,
  updatePasskeyUsage,
  getRpSettings,
} from "../_shared/mfa.ts";
import { isoBase64URL, verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@7.4.0?dts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getAdminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL y SERVICE_ROLE son requeridos");
  }
  return createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
};

interface VerifyLoginBody {
  email: string;
  password: string;
  code?: string;
  backupCode?: string;
  deviceFingerprint?: string;
  deviceName?: string;
  rememberDevice?: boolean;
  overrideToken?: string;
  passkeyAssertion?: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const body = (await req.json()) as VerifyLoginBody;
    if (!body.email || !body.password) {
      throw new Error("Email y contraseña son obligatorios");
    }

    const supabase = getServiceSupabase();
    const admin = getAdminClient();

    const { data: userList, error: listError } = await admin.auth.admin.listUsers({ email: body.email });
    if (listError) throw listError;
    const user = userList?.users?.[0];
    if (!user) {
      throw new Error("Credenciales inválidas");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, user_id, email, mfa_required, mfa_enrolled, premium_locked")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const requiresMfa = profile?.mfa_required ?? true;
    const enrolled = profile?.mfa_enrolled ?? false;

    let session: Session | null = null;

    const signIn = async () => {
      const { data, error } = await admin.auth.signInWithPassword({ email: body.email, password: body.password });
      if (error || !data.session) {
        throw new Error(error?.message ?? "No se pudo iniciar sesión");
      }
      session = data.session;
    };

    const upsertTrustedDevice = async () => {
      if (!body.deviceFingerprint || !body.rememberDevice) return;
      await supabase
        .from("trusted_devices")
        .upsert({
          user_id: user.id,
          device_fingerprint: body.deviceFingerprint,
          display_name: body.deviceName ?? "Dispositivo de confianza",
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "user_id,device_fingerprint" });
    };

    if (!requiresMfa || !enrolled) {
      await signIn();
      if (session) {
        await supabase
          .from("profiles")
          .update({ mfa_verified_at: new Date().toISOString(), premium_locked: false, premium_locked_reason: null })
          .eq("user_id", user.id);
      }
      return new Response(
        JSON.stringify({ requiresMfa: false, session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const passkeyCredentials = await getPasskeyCredentials(supabase, user.id);

    const { data: factor } = await supabase
      .from("mfa_factors")
      .select("id, secret, confirmed_at")
      .eq("user_id", user.id)
      .eq("factor_type", "totp")
      .maybeSingle();

    if (!factor?.confirmed_at && passkeyCredentials.length === 0) {
      return new Response(JSON.stringify({ requiresMfa: true, enrollmentIncomplete: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let verified = false;
    let verificationMethod: "totp" | "backup" | "override" | "passkey" | null = null;
    if (body.overrideToken) {
      const tokenHash = await hashValue(body.overrideToken);
      const { data: override } = await supabase
        .from("mfa_override_tokens")
        .select("id, expires_at, consumed_at")
        .eq("user_id", user.id)
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!override) {
        throw new Error("Token de soporte inválido");
      }
      if (override.consumed_at) {
        throw new Error("El token ya fue utilizado");
      }
      if (new Date(override.expires_at) < new Date()) {
        throw new Error("El token expiró");
      }
      verified = true;
      await supabase
        .from("mfa_override_tokens")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", override.id);
      verificationMethod = "override";
    }

    if (!verified && body.code) {
      if (!factor?.secret) {
        throw new Error("No hay un factor TOTP configurado");
      }
      verified = authenticator.check(body.code, factor.secret);
      if (!verified) {
        throw new Error("Código MFA incorrecto");
      }
      verificationMethod = "totp";
    }

    if (!verified && body.backupCode) {
      const hashed = await hashValue(body.backupCode);
      const { data: backup } = await supabase
        .from("mfa_backup_codes")
        .select("id, consumed")
        .eq("user_id", user.id)
        .eq("code_hash", hashed)
        .maybeSingle();
      if (!backup) {
        throw new Error("Código de respaldo inválido");
      }
      if (backup.consumed) {
        throw new Error("El código de respaldo ya fue usado");
      }
      verified = true;
      await supabase
        .from("mfa_backup_codes")
        .update({ consumed: true, consumed_at: new Date().toISOString() })
        .eq("id", backup.id);
      verificationMethod = "backup";
    }

    if (!verified && body.passkeyAssertion) {
      const challenge = await consumeWebauthnChallenge(supabase, user.id, "authentication");
      if (!challenge) {
        throw new Error("Inicia nuevamente la solicitud de passkey");
      }

      const assertion = body.passkeyAssertion as Record<string, unknown>;
      const credentialId = typeof assertion?.id === "string" ? assertion.id : undefined;
      if (!credentialId) {
        throw new Error("La respuesta de passkey no es válida");
      }

      const credential = passkeyCredentials.find((cred) => cred.credential_id === credentialId);
      if (!credential) {
        throw new Error("La passkey no está registrada en esta cuenta");
      }

      const { rpId, origin } = getRpSettings();
      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        authenticator: {
          credentialID: isoBase64URL.toBuffer(credential.credential_id),
          credentialPublicKey: isoBase64URL.toBuffer(credential.public_key),
          counter: credential.sign_count,
        },
        requireUserVerification: true,
      });

      if (!verification.verified) {
        throw new Error("No se pudo validar la passkey");
      }

      const newCounter = verification.authenticationInfo?.newCounter ?? credential.sign_count;
      await updatePasskeyUsage(supabase, credential.credential_id, newCounter);
      verified = true;
      verificationMethod = "passkey";
    }

    if (!verified) {
      return new Response(JSON.stringify({ requiresMfa: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    await signIn();
    await supabase
      .from("profiles")
      .update({ mfa_verified_at: new Date().toISOString(), premium_locked: false, premium_locked_reason: null })
      .eq("user_id", user.id);

    if (body.deviceFingerprint) {
      await upsertTrustedDevice();
    }

    if (profile) {
      await syncStripeMfaState(user.id, profile.email, true, { profileId: profile.id, supabaseClient: supabase });
    }

    await supabase.from("session_audit_logs").insert({
      user_id: user.id,
      event_type: "mfa_challenge_passed",
      metadata: { via: verificationMethod ?? "unknown" },
    });

    const responseBody: Record<string, unknown> = { requiresMfa: false, session };

    if (body.overrideToken) {
      const replacementCodes = generateBackupCodes();
      const replacementPayload = await Promise.all(
        replacementCodes.map(async (value) => ({
          factor_id: factor.id,
          user_id: user.id,
          code_hash: await hashValue(value),
          code_hint: value.slice(-4),
        })),
      );
      await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);
      await supabase.from("mfa_backup_codes").insert(replacementPayload);
      responseBody.backupCodes = replacementCodes;
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-verify-login]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
