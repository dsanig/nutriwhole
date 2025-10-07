import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  generateAuthenticationOptions,
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
    const body = await req.json();
    const email: string | undefined = body?.email;
    if (!email) throw new Error("Email requerido");

    const supabase = getServiceSupabase();
    const { data: userLookup, error: userError } = await supabase.auth.admin.listUsers({
      email: email.toLowerCase(),
      page: 1,
      perPage: 1,
    });

    if (userError) throw userError;
    const user = userLookup?.users?.[0];

    if (!user?.id) {
      // We do not reveal whether the email exists to prevent enumeration.
      return new Response(JSON.stringify({ options: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const credentials = await getPasskeyCredentials(supabase, user.id);
    if (credentials.length === 0) {
      return new Response(JSON.stringify({ options: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const allowCredentials = credentials.map((cred) => ({
      id: isoBase64URL.toBuffer(cred.credential_id),
      type: "public-key" as const,
      transports: cred.transports ?? undefined,
    }));

    const { rpId } = getRpSettings();
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials,
      userVerification: "preferred",
    });

    await persistWebauthnChallenge(supabase, {
      userId: user.id,
      type: "authentication",
      challenge: options.challenge,
    });

    return new Response(JSON.stringify({ options }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-passkey-challenge]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
