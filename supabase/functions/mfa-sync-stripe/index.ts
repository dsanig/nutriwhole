import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase, syncStripeMfaState } from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncBody {
  targetUserId?: string;
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Autenticación requerida");

    const supabase = getServiceSupabase();
    const token = authHeader.replace("Bearer ", "");
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    if (requesterError || !requesterData.user) throw new Error("Sesión inválida");

    const body = ((await req.json().catch(() => ({}))) ?? {}) as SyncBody;
    const targetUserId = body.targetUserId ?? requesterData.user.id;

    if (targetUserId !== requesterData.user.id) {
      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", requesterData.user.id)
        .maybeSingle();
      if (requesterProfile?.role !== "admin") {
        throw new Error("Solo los administradores pueden sincronizar otros usuarios");
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, mfa_enrolled")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("No se encontró el perfil");

    const syncResult = await syncStripeMfaState(targetUserId, profile.email, Boolean(profile.mfa_enrolled), {
      profileId: profile.id,
      supabaseClient: supabase,
    });

    return new Response(
      JSON.stringify({ synced: syncResult.synced, customerId: syncResult.customerId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("[mfa-sync-stripe]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
