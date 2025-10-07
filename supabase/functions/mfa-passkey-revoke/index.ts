import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    if (!authHeader) throw new Error("Se requiere autenticación");
    const token = authHeader.replace("Bearer ", "");

    const body = await req.json();
    const passkeyId: string | undefined = body?.passkeyId;
    if (!passkeyId) throw new Error("Identificador de passkey requerido");

    const supabase = getServiceSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesión inválida");

    const user = userData.user;

    const { data: passkey, error: fetchError } = await supabase
      .from("mfa_passkeys")
      .select("id, factor_id")
      .eq("id", passkeyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!passkey) throw new Error("Passkey no encontrada");

    await supabase.from("mfa_passkeys").delete().eq("id", passkey.id);
    await supabase.from("mfa_factors").delete().eq("id", passkey.factor_id);

    return new Response(JSON.stringify({ revoked: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-passkey-revoke]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
