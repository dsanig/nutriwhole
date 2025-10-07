import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface ConnectorSample {
  metricSlug: string;
  recordedAt: string;
  valueNumeric?: number;
  valueText?: string;
  valueJson?: Record<string, unknown>;
  note?: string;
  source?: string;
}

export interface ConnectorOptions {
  provider: string;
}

export const getServiceSupabase = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos");
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export const recordSyncRun = async (
  supabase: ReturnType<typeof getServiceSupabase>,
  connectionId: string,
  provider: string,
  status: "pending" | "success" | "error",
  payload?: Record<string, unknown>,
  errorMessage?: string,
) => {
  const insert = await supabase
    .from("telemetry_sync_runs")
    .insert({
      connection_id: connectionId,
      provider,
      status,
      payload: payload ?? {},
      error_message: errorMessage ?? null,
      finished_at: status === "pending" ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insert.error) {
    console.error("[recordSyncRun]", insert.error);
  }
};

export const storeSamples = async (
  supabase: ReturnType<typeof getServiceSupabase>,
  profileId: string,
  samples: ConnectorSample[],
) => {
  if (samples.length === 0) return;

  const { data: metricCatalog, error: catalogError } = await supabase
    .from("wellness_metrics")
    .select("id, slug")
    .in(
      "slug",
      samples.map((sample) => sample.metricSlug),
    );
  if (catalogError) throw catalogError;

  const catalogMap = new Map(metricCatalog.map((metric) => [metric.slug, metric.id] as const));

  const rows = samples
    .map((sample) => {
      const metricId = catalogMap.get(sample.metricSlug);
      if (!metricId) return null;
      return {
        metric_id: metricId,
        profile_id: profileId,
        recorded_at: new Date(sample.recordedAt).toISOString(),
        source: sample.source ?? "wearable",
        value_numeric: sample.valueNumeric ?? null,
        value_text: sample.valueText ?? null,
        value_json: sample.valueJson ?? null,
        note: sample.note ?? null,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("wellness_metric_samples").insert(rows as never);
  if (insertError) throw insertError;
};
