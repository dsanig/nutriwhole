import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase } from "../_shared/connectors.ts";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const supabase = getServiceSupabase();

  try {
    const { data: events, error } = await supabase
      .from("automation_events")
      .select("id, profile_id, event_type, payload")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .limit(10);
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const event of events ?? []) {
      try {
        await supabase
          .from("automation_events")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", event.id);

        if (event.event_type === "lifestyle_adjustment") {
          const response = await fetch(`${supabaseUrl}/functions/v1/apply-lifestyle-adjustments`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRole}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ profileId: event.profile_id, context: event.payload ?? {} }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body?.error ?? `Fallo apply-lifestyle-adjustments (${response.status})`);
          }
        }

        await supabase
          .from("automation_events")
          .update({ status: "completed", updated_at: new Date().toISOString(), error_message: null })
          .eq("id", event.id);
        results.push({ id: event.id, status: "completed" });
      } catch (eventError) {
        console.error(`[lifestyle-automation-dispatcher] ${event.id}`, eventError);
        await supabase
          .from("automation_events")
          .update({ status: "failed", updated_at: new Date().toISOString(), error_message: eventError instanceof Error ? eventError.message : String(eventError) })
          .eq("id", event.id);
        results.push({ id: event.id, status: "failed", error: eventError instanceof Error ? eventError.message : String(eventError) });
      }
    }

    return new Response(JSON.stringify({ processed: events?.length ?? 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[lifestyle-automation-dispatcher]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
