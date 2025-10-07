import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  isoBase64URL,
  verifyRegistrationResponse,
} from "https://esm.sh/@simplewebauthn/server@7.4.0?dts";
import {
  getServiceSupabase,
  consumeWebauthnChallenge,
  getRpSettings,
  syncStripeMfaState,
} from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Se requiere autenticación");
    const token = authHeader.replace("Bearer ", "");

    const body = await req.json();
    const friendlyName: string | undefined = body?.friendlyName;
    const attestation = body?.attestation;
    if (!attestation) {
      throw new Error("Respuesta de registro no recibida");
    }

    const supabase = getServiceSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesión inválida");
    const user = userData.user;

    const challenge = await consumeWebauthnChallenge(supabase, user.id, "registration");
    if (!challenge) throw new Error("No hay un desafío WebAuthn activo");

    const { rpId, origin } = getRpSettings();

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("No se pudo verificar la respuesta de passkey");
    }

    const {
      credentialID,
      credentialPublicKey,
      counter,
      attestationFormat,
      aaguid,
    } = verification.registrationInfo;

    const credentialIdBase64 = isoBase64URL.fromBuffer(credentialID);
    const publicKeyBase64 = isoBase64URL.fromBuffer(credentialPublicKey);

    const { data: factorData, error: factorError } = await supabase
      .from("mfa_factors")
      .insert({
        user_id: user.id,
        factor_type: "passkey",
        friendly_name: friendlyName ?? "Passkey",
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (factorError) throw factorError;

    const transports = Array.isArray(attestation?.transports)
      ? attestation.transports
      : Array.isArray(attestation?.response?.transports)
        ? attestation.response.transports
        : null;

    await supabase.from("mfa_passkeys").insert({
      factor_id: factorData.id,
      user_id: user.id,
      credential_id: credentialIdBase64,
      public_key: publicKeyBase64,
      transports,
      sign_count: counter ?? 0,
      attestation_format: attestationFormat ?? null,
      aa_guid: aaguid ?? null,
      friendly_name: friendlyName ?? "Passkey",
    });

    await supabase
      .from("profiles")
      .update({ mfa_enrolled: true, mfa_verified_at: new Date().toISOString(), premium_locked: false, premium_locked_reason: null })
      .eq("user_id", user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      await syncStripeMfaState(user.id, profile.email, true, { profileId: profile.id, supabaseClient: supabase });
    }

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-passkey-finish]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
