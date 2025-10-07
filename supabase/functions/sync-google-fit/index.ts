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

const PROVIDER = "google_fit";

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
  const clientId = Deno.env.get("GOOGLE_FIT_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_FIT_CLIENT_SECRET");
  const apiBase = Deno.env.get("GOOGLE_FIT_BASE_URL");
  if (!clientId || !clientSecret || !apiBase) {
    return new Response(JSON.stringify({ error: "Configura GOOGLE_FIT_CLIENT_ID, GOOGLE_FIT_CLIENT_SECRET y GOOGLE_FIT_BASE_URL" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    const { data: connections, error } = await supabase
      .from("wearable_connections")
      .select("id, profile_id, access_token, refresh_token, token_expires_at, metadata")
      .eq("provider", PROVIDER)
      .eq("status", "connected");
    if (error) throw error;

    for (const connection of connections ?? []) {
      let accessToken = connection.access_token as string | null;
      const refreshToken = connection.refresh_token as string | null;
      const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;

      try {
        if (!accessToken && refreshToken) {
          const tokenRes = await fetch(`${apiBase}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }),
          });
          if (!tokenRes.ok) {
            throw new Error(`No se pudo refrescar el token (${tokenRes.status})`);
          }
          const tokenJson = await tokenRes.json();
          accessToken = tokenJson.access_token;
          await supabase
            .from("wearable_connections")
            .update({ access_token: accessToken, token_expires_at: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString() })
            .eq("id", connection.id);
        } else if (accessToken && expiresAt && expiresAt < new Date() && refreshToken) {
          accessToken = null;
          const tokenRes = await fetch(`${apiBase}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }),
          });
          if (!tokenRes.ok) {
            throw new Error(`No se pudo refrescar el token (${tokenRes.status})`);
          }
          const tokenJson = await tokenRes.json();
          accessToken = tokenJson.access_token;
          await supabase
            .from("wearable_connections")
            .update({ access_token: accessToken, token_expires_at: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString() })
            .eq("id", connection.id);
        }

        if (!accessToken) {
          throw new Error("Sin token de acceso válido");
        }

        const response = await fetch(`${apiBase}/v1/users/me/datasets`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error(`Google Fit respondió ${response.status}`);
        }
        const payload = await response.json();
        const datasets = (payload?.datasets ?? []) as Array<Record<string, unknown>>;
        const samples: ConnectorSample[] = datasets.map((entry) => ({
          metricSlug: String(entry.metricSlug ?? entry.metric_slug ?? ""),
          recordedAt: String(entry.recordedAt ?? entry.recorded_at ?? new Date().toISOString()),
          valueNumeric: typeof entry.valueNumeric === "number" ? (entry.valueNumeric as number) : undefined,
          valueJson: typeof entry.valueJson === "object" && entry.valueJson !== null ? (entry.valueJson as Record<string, unknown>) : undefined,
          source: "wearable",
        })).filter((sample) => Boolean(sample.metricSlug));

        await storeSamples(supabase, connection.profile_id, samples);
        await supabase
          .from("wearable_connections")
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq("id", connection.id);
        await recordSyncRun(supabase, connection.id, PROVIDER, "success", { samples: samples.length });
      } catch (syncError) {
        console.error(`[sync-google-fit] ${connection.id}`, syncError);
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
    console.error("[sync-google-fit]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
