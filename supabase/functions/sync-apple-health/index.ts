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

const APPLE_PROVIDER = "apple_health";

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
  const baseUrl = Deno.env.get("APPLE_HEALTH_BASE_URL");
  const apiKey = Deno.env.get("APPLE_HEALTH_API_KEY");
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: "Configura APPLE_HEALTH_BASE_URL y APPLE_HEALTH_API_KEY" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    const { data: connections, error } = await supabase
      .from("wearable_connections")
      .select("id, profile_id, metadata")
      .eq("provider", APPLE_PROVIDER)
      .eq("status", "connected");
    if (error) throw error;

    for (const connection of connections ?? []) {
      const metadata = connection.metadata as Record<string, unknown>;
      const externalUserId = metadata?.externalUserId as string | undefined;
      if (!externalUserId) {
        await recordSyncRun(supabase, connection.id, APPLE_PROVIDER, "error", {}, "Falta externalUserId en metadata");
        continue;
      }

      try {
        const response = await fetch(`${baseUrl}/v1/users/${externalUserId}/metrics`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`Apple Health respondió ${response.status}`);
        }
        const payload = await response.json();
        const entries = (payload?.entries ?? []) as Array<Record<string, unknown>>;
        const samples: ConnectorSample[] = entries.map((entry) => ({
          metricSlug: String(entry.metricSlug ?? entry.metric_slug ?? ""),
          recordedAt: String(entry.recordedAt ?? entry.recorded_at ?? new Date().toISOString()),
          valueNumeric: typeof entry.valueNumeric === "number" ? (entry.valueNumeric as number) : undefined,
          valueText: typeof entry.valueText === "string" ? (entry.valueText as string) : undefined,
          valueJson: typeof entry.valueJson === "object" && entry.valueJson !== null ? (entry.valueJson as Record<string, unknown>) : undefined,
          note: typeof entry.note === "string" ? (entry.note as string) : undefined,
          source: "wearable",
        })).filter((sample) => Boolean(sample.metricSlug));

        await storeSamples(supabase, connection.profile_id, samples);
        await supabase
          .from("wearable_connections")
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq("id", connection.id);
        await recordSyncRun(supabase, connection.id, APPLE_PROVIDER, "success", { samples: samples.length });
      } catch (syncError) {
        console.error(`[sync-apple-health] ${connection.id}`, syncError);
        await supabase
          .from("wearable_connections")
          .update({ last_error: syncError instanceof Error ? syncError.message : String(syncError) })
          .eq("id", connection.id);
        await recordSyncRun(
          supabase,
          connection.id,
          APPLE_PROVIDER,
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
    console.error("[sync-apple-health]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
