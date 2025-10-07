import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticator } from "https://esm.sh/otplib@12.0.1/authenticator?dts";
import { generateBackupCodes, getServiceSupabase, hashValue, syncStripeMfaState } from "../_shared/mfa.ts";

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

    const supabase = getServiceSupabase();
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) throw new Error("Sesión inválida");

    const user = userData.user;
    const body = await req.json();
    const code: string | undefined = body?.code;
    const deviceFingerprint: string | undefined = body?.deviceFingerprint;
    const deviceName: string | undefined = body?.deviceName;

    if (!code) throw new Error("Ingresa el código de tu app de autenticación");

    const { data: factor, error: factorError } = await supabase
      .from("mfa_factors")
      .select("id, secret, confirmed_at")
      .eq("user_id", user.id)
      .eq("factor_type", "totp")
      .maybeSingle();

    if (factorError) throw factorError;
    if (!factor) throw new Error("No existe un factor TOTP registrado");

    const isValid = authenticator.check(code, factor.secret);
    if (!isValid) throw new Error("Código inválido, intenta nuevamente");

    const backupCodes = generateBackupCodes();
    const backupPayload = await Promise.all(
      backupCodes.map(async (value) => ({
        factor_id: factor.id,
        user_id: user.id,
        code_hash: await hashValue(value),
        code_hint: value.slice(-4),
      })),
    );

    await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);
    await supabase.from("mfa_backup_codes").insert(backupPayload);

    await supabase
      .from("mfa_factors")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", factor.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, email")
      .eq("user_id", user.id)
      .maybeSingle();

    await supabase
      .from("profiles")
      .update({ mfa_enrolled: true, mfa_verified_at: new Date().toISOString(), premium_locked: false, premium_locked_reason: null })
      .eq("user_id", user.id);

    if (deviceFingerprint) {
      await supabase
        .from("trusted_devices")
        .upsert({
          user_id: user.id,
          device_fingerprint: deviceFingerprint,
          display_name: deviceName ?? "Dispositivo de confianza",
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "user_id,device_fingerprint" });
    }

    await supabase.from("session_audit_logs").insert({
      user_id: user.id,
      event_type: "mfa_enrolled",
      metadata: { deviceFingerprint, deviceName },
    });

    if (profile) {
      await syncStripeMfaState(user.id, profile.email, true, { profileId: profile.id, supabaseClient: supabase });
    }

    return new Response(
      JSON.stringify({ backupCodes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("[mfa-confirm]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
