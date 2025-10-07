import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  getServiceSupabase,
  recordSyncRun,
  storeSamples,
  type ConnectorSample,
} from "../_shared/connectors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER = "lab_partner";

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

  const supabase = getServiceSupabase();
  const apiBase = Deno.env.get("LAB_RESULTS_BASE_URL");
  const apiKey = Deno.env.get("LAB_RESULTS_API_KEY");
  if (!apiBase || !apiKey) {
    return new Response(JSON.stringify({ error: "Configura LAB_RESULTS_BASE_URL y LAB_RESULTS_API_KEY" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    const { data: connections, error } = await supabase
      .from("wearable_connections")
      .select("id, profile_id, metadata")
      .eq("provider", PROVIDER)
      .eq("status", "connected");
    if (error) throw error;

    for (const connection of connections ?? []) {
      const metadata = connection.metadata as Record<string, unknown>;
      const labPatientId = metadata?.labPatientId as string | undefined;
      if (!labPatientId) {
        await recordSyncRun(supabase, connection.id, PROVIDER, "error", {}, "Falta labPatientId en metadata");
        continue;
      }

      try {
        const response = await fetch(`${apiBase}/v1/patients/${labPatientId}/results`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`Laboratorio respondió ${response.status}`);
        }
        const payload = await response.json();
        const results = (payload?.results ?? []) as Array<Record<string, unknown>>;
        const samples: ConnectorSample[] = results.map((result) => ({
          metricSlug: String(result.metricSlug ?? result.metric_slug ?? ""),
          recordedAt: String(result.recordedAt ?? result.recorded_at ?? new Date().toISOString()),
          valueNumeric: typeof result.valueNumeric === "number" ? (result.valueNumeric as number) : undefined,
          valueText: typeof result.valueText === "string" ? (result.valueText as string) : undefined,
          valueJson: typeof result.valueJson === "object" && result.valueJson !== null ? (result.valueJson as Record<string, unknown>) : undefined,
          note: typeof result.note === "string" ? (result.note as string) : undefined,
          source: "lab",
        })).filter((sample) => Boolean(sample.metricSlug));

        await storeSamples(supabase, connection.profile_id, samples);
        await supabase
          .from("wearable_connections")
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq("id", connection.id);
        await recordSyncRun(supabase, connection.id, PROVIDER, "success", { samples: samples.length });
      } catch (syncError) {
        console.error(`[sync-lab-results] ${connection.id}`, syncError);
        await supabase
          .from("wearable_connections")
          .update({ last_error: syncError instanceof Error ? syncError.message : String(syncError) })
          .eq("id", connection.id);
        await recordSyncRun(
          supabase,
          connection.id,
          PROVIDER,
          "error",
          {},
          syncError instanceof Error ? syncError.message : String(syncError),
        );
      }
    }

    return new Response(JSON.stringify({ processed: connections?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-lab-results]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
