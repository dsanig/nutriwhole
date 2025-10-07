import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase } from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InsightRequest {
  subjectProfileId: string;
  focus?: string;
}

interface GeminiInsightPayload {
  headline: string;
  narrative?: string;
  focus_area?: string;
  recommendations?: Array<{ title?: string; detail?: string } | string>;
  cards?: Array<{ card_type: string; headline: string; body?: string; cta_label?: string }>;
  confidence?: number;
  risk_level?: string;
  requires_follow_up?: boolean;
}

const buildPrompt = (profileName: string | null, focus: string | undefined, snapshot: Record<string, unknown>) => {
  const base = `Actúa como un coach integral que utiliza datos biométricos, hábitos, agenda y sentimientos para entregar recomendaciones accionables. Responde en JSON con el siguiente formato:
{
  "headline": string,
  "narrative": string,
  "focus_area": string,
  "recommendations": [{"title": string, "detail": string}, ...],
  "cards": [{"card_type": string, "headline": string, "body": string, "cta_label": string}],
  "confidence": number (0-1),
  "risk_level": string,
  "requires_follow_up": boolean
}
Usa un tono empático y breve.`;

  const context = `
Perfil: ${profileName ?? "Cliente"}
Enfoque solicitado: ${focus ?? "balance general"}
Datos recientes (JSON): ${JSON.stringify(snapshot)}
  `;

  return `${base}\n${context}`;
};

const parseGemini = (raw: unknown): GeminiInsightPayload => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Respuesta de Gemini inválida");
  }
  if (Array.isArray(raw)) {
    return parseGemini(raw[0]);
  }
  const payload = raw as Record<string, unknown>;
  const recommendations = Array.isArray(payload.recommendations)
    ? (payload.recommendations as Array<{ title?: string; detail?: string } | string>)
    : [];
  const cards = Array.isArray(payload.cards)
    ? (payload.cards as Array<{ card_type: string; headline: string; body?: string; cta_label?: string }>)
    : [];
  return {
    headline: String(payload.headline ?? "Insight personalizado"),
    narrative: payload.narrative ? String(payload.narrative) : undefined,
    focus_area: payload.focus_area ? String(payload.focus_area) : undefined,
    recommendations,
    cards,
    confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
    risk_level: payload.risk_level ? String(payload.risk_level) : undefined,
    requires_follow_up: Boolean(payload.requires_follow_up),
  };
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

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY no configurado");

    const supabase = getServiceSupabase();
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesión inválida");

    const body = (await req.json()) as InsightRequest;
    if (!body.subjectProfileId) throw new Error("subjectProfileId es obligatorio");

    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: subjectProfile, error: subjectError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", body.subjectProfileId)
      .maybeSingle();
    if (subjectError || !subjectProfile) throw new Error("Perfil objetivo no encontrado");

    const { data: access } = await supabase.rpc("can_access_profile_artifacts", {
      _profile_id: body.subjectProfileId,
    });
    if (!access) {
      throw new Error("No tienes permisos para consultar este perfil");
    }

    const agendaLookbackDays = Number(Deno.env.get("GEMINI_AGENDA_LOOKBACK_DAYS") ?? 7);
    const lookbackStart = new Date();
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - Math.max(agendaLookbackDays, 1));
    const lookbackIso = lookbackStart.toISOString().slice(0, 10);

    const [metricsResult, sentimentsResult, streaksResult, agendaDaysResult] = await Promise.all([
      supabase
        .from("wellness_metric_samples")
        .select("recorded_for, recorded_at, value_numeric, note, source, wellness_metrics(display_name, slug, unit)")
        .eq("profile_id", body.subjectProfileId)
        .order("recorded_at", { ascending: false })
        .limit(20),
      supabase
        .from("client_sentiment_entries")
        .select("mood_score, energy_score, note, recorded_at")
        .eq("profile_id", body.subjectProfileId)
        .order("recorded_at", { ascending: false })
        .limit(10),
      supabase
        .from("client_behavior_streaks")
        .select("habit_name, current_streak, longest_streak")
        .eq("profile_id", body.subjectProfileId),
      supabase
        .from("agenda_days")
        .select("id")
        .eq("profile_id", body.subjectProfileId)
        .gte("agenda_date", lookbackIso)
        .order("agenda_date", { ascending: false })
        .limit(agendaLookbackDays * 2),
    ]);

    if (metricsResult.error) {
      throw new Error(`No se pudieron obtener métricas recientes: ${metricsResult.error.message}`);
    }
    if (sentimentsResult.error) {
      throw new Error(`No se pudieron obtener los registros de ánimo: ${sentimentsResult.error.message}`);
    }
    if (streaksResult.error) {
      throw new Error(`No se pudieron obtener las rachas de hábitos: ${streaksResult.error.message}`);
    }
    if (agendaDaysResult.error && agendaDaysResult.error.code !== "PGRST116") {
      throw new Error(`No se pudieron consultar los días de agenda: ${agendaDaysResult.error.message}`);
    }

    const dayIds = (agendaDaysResult.data ?? []).map((day: { id: string }) => day.id);
    let agenda: unknown[] = [];
    if (dayIds.length > 0) {
      const { data: agendaItems, error: agendaItemsError } = await supabase
        .from("agenda_items")
        .select("agenda_day_id, item_type, title, description, completion_state, recommended")
        .in("agenda_day_id", dayIds)
        .limit(agendaLookbackDays * 8);
      if (agendaItemsError) {
        throw new Error(`No se pudieron obtener las actividades de la agenda: ${agendaItemsError.message}`);
      }
      agenda = agendaItems ?? [];
    }

    const metrics = metricsResult.data ?? [];
    const sentiments = sentimentsResult.data ?? [];
    const streaks = streaksResult.data ?? [];

    const snapshot = {
      metrics,
      sentiments,
      streaks,
      agenda,
      focus: body.focus ?? null,
    };

    const prompt = buildPrompt(subjectProfile.full_name, body.focus, snapshot);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini respondió con error: ${errorText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(data);
    let parsed: GeminiInsightPayload;
    try {
      parsed = parseGemini(JSON.parse(rawText));
    } catch (_err) {
      parsed = parseGemini(data?.candidates?.[0]?.content?.parts?.[0]);
    }

    const { data: insertedInsight, error: insertError } = await supabase
      .from("ai_insights")
      .insert({
        subject_profile_id: body.subjectProfileId,
        focus_area: parsed.focus_area ?? (body.focus ?? "general"),
        headline: parsed.headline,
        narrative: parsed.narrative ?? null,
        recommendations: parsed.recommendations ?? [],
        confidence: parsed.confidence ?? null,
        risk_level: parsed.risk_level ?? null,
        requires_follow_up: parsed.requires_follow_up ?? false,
      })
      .select("id")
      .single();

    if (insertError || !insertedInsight) throw insertError;

    if (parsed.cards && parsed.cards.length > 0) {
      const cardPayload = parsed.cards.map((card) => ({
        insight_id: insertedInsight.id,
        card_type: card.card_type,
        headline: card.headline,
        body: card.body ?? null,
        cta_label: card.cta_label ?? null,
      }));
      await supabase.from("ai_insight_cards").insert(cardPayload);
    }

    await supabase.from("ai_usage_events").insert({
      actor_user_id: userData.user.id,
      subject_profile_id: body.subjectProfileId,
      event_type: "insight_generated",
      metadata: { focus: body.focus ?? null, requester_role: requesterProfile?.role ?? null },
    });

    return new Response(
      JSON.stringify({ insight_id: insertedInsight.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("[gemini-insights]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
