import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticator } from "https://esm.sh/otplib@12.0.1/authenticator?dts";
import { getServiceSupabase } from "../_shared/mfa.ts";

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
    if (!authHeader) {
      throw new Error("Se requiere autenticación para iniciar MFA");
    }

    const supabase = getServiceSupabase();
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      throw new Error("No se pudo validar la sesión");
    }

    const user = userData.user;
    const body = await req.json();
    const friendlyName: string = body?.friendlyName ?? "NutriWhole";

    const secret = authenticator.generateSecret(32);
    const otpauthUrl = authenticator.keyuri(user.email ?? "usuario", "NutriWhole", secret);

    const { data: existingFactor } = await supabase
      .from("mfa_factors")
      .select("id, confirmed_at")
      .eq("user_id", user.id)
      .eq("factor_type", "totp")
      .maybeSingle();

    if (existingFactor) {
      await supabase
        .from("mfa_factors")
        .update({
          secret,
          friendly_name: friendlyName,
          confirmed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingFactor.id);
    } else {
      await supabase.from("mfa_factors").insert({
        user_id: user.id,
        factor_type: "totp",
        friendly_name: friendlyName,
        secret,
      });
    }

    await supabase.from("session_audit_logs").insert({
      user_id: user.id,
      event_type: "mfa_enrollment_started",
      metadata: { friendlyName },
    });

    return new Response(
      JSON.stringify({ secret, otpauthUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("[mfa-start]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
