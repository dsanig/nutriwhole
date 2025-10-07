import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  generateRegistrationOptions,
  isoBase64URL,
} from "https://esm.sh/@simplewebauthn/server@7.4.0?dts";
import {
  getServiceSupabase,
  getPasskeyCredentials,
  persistWebauthnChallenge,
  getRpSettings,
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

    const supabase = getServiceSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesión inválida");

    const user = userData.user;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const credentials = await getPasskeyCredentials(supabase, user.id);
    const excludeCredentials = credentials.map((cred) => ({
      id: isoBase64URL.toBuffer(cred.credential_id),
      type: "public-key" as const,
    }));

    const { rpId, rpName } = getRpSettings();
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: user.id,
      userName: profile?.email ?? user.email ?? user.id,
      userDisplayName: profile?.full_name ?? user.email ?? user.id,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    await persistWebauthnChallenge(supabase, {
      userId: user.id,
      type: "registration",
      challenge: options.challenge,
    });

    return new Response(JSON.stringify({ options }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-passkey-start]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
