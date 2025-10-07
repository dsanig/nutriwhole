import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase, hashValue } from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OverrideBody {
  targetUserId: string;
  reason?: string;
  expiresInMinutes?: number;
}

const randomToken = () => {
  const array = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    if (!authHeader) throw new Error("Autenticación requerida");

    const supabase = getServiceSupabase();
    const token = authHeader.replace("Bearer ", "");
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    if (requesterError || !requesterData.user) throw new Error("Sesión inválida");

    const body = (await req.json()) as OverrideBody;
    if (!body.targetUserId) throw new Error("Debes indicar el usuario objetivo");

    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", requesterData.user.id)
      .maybeSingle();

    if (requesterProfile?.role !== "admin") {
      throw new Error("Solo los administradores pueden emitir overrides");
    }

    const expiresIn = body.expiresInMinutes ?? 30;
    const plainToken = randomToken();
    const tokenHash = await hashValue(plainToken);

    await supabase.from("mfa_override_tokens").insert({
      user_id: body.targetUserId,
      issued_by: requesterData.user.id,
      token_hash: tokenHash,
      reason: body.reason ?? "Override temporal generado por soporte",
      expires_at: new Date(Date.now() + expiresIn * 60_000).toISOString(),
    });

    await supabase.from("session_audit_logs").insert({
      user_id: body.targetUserId,
      event_type: "mfa_override_issued",
      metadata: { issued_by: requesterData.user.id, expires_in: expiresIn },
    });

    return new Response(JSON.stringify({ token: plainToken, expiresInMinutes: expiresIn }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[mfa-admin-override]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
