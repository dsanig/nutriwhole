import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase } from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "apple_health" | "google_fit" | "lab_panel";

interface MetricPayload {
  slug: string;
  value: number | string | Record<string, unknown>;
  recordedAt: string;
  recordedFor?: string | null;
  unit?: string | null;
  note?: string | null;
}

interface TelemetryRequest {
  provider: Provider;
  profileId: string;
  metrics: MetricPayload[];
  metadata?: Record<string, unknown>;
}

const ensureMetricCatalog = async (supabase: ReturnType<typeof getServiceSupabase>, payload: MetricPayload) => {
  const { data: metric } = await supabase
    .from("wellness_metrics")
    .select("id")
    .eq("slug", payload.slug)
    .maybeSingle();

  if (metric) {
    return metric.id as string;
  }

  const displayName = payload.slug
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  const { data: inserted, error } = await supabase
    .from("wellness_metrics")
    .insert({
      slug: payload.slug,
      display_name: displayName,
      category: "biometric",
      unit: payload.unit ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`No se pudo registrar el métrico ${payload.slug}: ${error?.message}`);
  }
  return inserted.id as string;
};

const normalizeValue = (metric: MetricPayload) => {
  if (typeof metric.value === "number") {
    return { value_numeric: metric.value };
  }
  if (typeof metric.value === "string") {
    const numeric = Number(metric.value);
    if (!Number.isNaN(numeric)) {
      return { value_numeric: numeric };
    }
    return { value_text: metric.value };
  }
  return { value_json: metric.value };
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
    const supabase = getServiceSupabase();
    const body = (await req.json()) as TelemetryRequest;

    const token = req.headers.get("x-connector-token");
    const expected = Deno.env.get("TELEMETRY_CONNECTOR_TOKEN");
    const authHeader = req.headers.get("Authorization");

    if (!expected && !authHeader) {
      throw new Error("Configura TELEMETRY_CONNECTOR_TOKEN o autentícate");
    }

    let authorized = Boolean(expected && token === expected);

    if (!authorized) {
      if (!authHeader) {
        throw new Error("No autorizado");
      }
      const bearer = authHeader.replace("Bearer ", "");
      const { data: userData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !userData.user) {
        throw new Error("Sesión inválida");
      }

      const { data: access } = await supabase.rpc("can_access_profile_artifacts", {
        _profile_id: body.profileId,
      });
      if (!access) {
        throw new Error("No tienes permisos para enviar datos a este perfil");
      }
      authorized = true;
    }

    if (!authorized) {
      throw new Error("Token de conector inválido");
    }

    if (!body.profileId || !body.provider || !Array.isArray(body.metrics)) {
      throw new Error("Solicitud incompleta");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", body.profileId)
      .maybeSingle();
    if (!profile) {
      throw new Error("Perfil de cliente no encontrado");
    }

    const inserts = [] as Array<Record<string, unknown>>;
    for (const metric of body.metrics) {
      const metricId = await ensureMetricCatalog(supabase, metric);
      const base = normalizeValue(metric);
      inserts.push({
        metric_id: metricId,
        profile_id: body.profileId,
        recorded_at: metric.recordedAt,
        recorded_for: metric.recordedFor ?? null,
        source: body.provider === "lab_panel" ? "lab" : "wearable",
        note: metric.note ?? null,
        ...base,
      });
    }

    if (inserts.length > 0) {
      await supabase.from("wellness_metric_samples").insert(inserts);
    }

    await supabase
      .from("wearable_connections")
      .upsert({
        profile_id: body.profileId,
        provider: body.provider,
        status: "connected",
        last_synced_at: new Date().toISOString(),
        metadata: body.metadata ?? {},
      }, { onConflict: "profile_id,provider" });

    return new Response(JSON.stringify({ inserted: inserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[ingest-telemetry]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
