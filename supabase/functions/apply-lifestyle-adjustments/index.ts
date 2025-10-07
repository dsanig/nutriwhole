import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceSupabase } from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdjustmentRequest {
  profileId: string;
  insightId?: string;
}

const LOW_MOOD_THRESHOLD = Number(Deno.env.get("LIFESTYLE_LOW_MOOD_THRESHOLD") ?? 5);
const MIN_SENTIMENT_ENTRIES = Number(Deno.env.get("LIFESTYLE_SENTIMENT_SAMPLE_MIN") ?? 3);
const MAX_RECOMMENDATIONS = Number(Deno.env.get("LIFESTYLE_MAX_RECOMMENDATIONS") ?? 2);

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
    const { data: requester, error: requesterError } = await supabase.auth.getUser(token);
    if (requesterError || !requester.user) throw new Error("Sesión inválida");

    const body = (await req.json()) as AdjustmentRequest;
    if (!body.profileId) throw new Error("profileId es obligatorio");

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", body.profileId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil objetivo no encontrado");

    const { data: access } = await supabase.rpc("can_access_profile_artifacts", {
      _profile_id: body.profileId,
    });
    if (!access) throw new Error("No tienes permisos para ajustar este plan");

    const insightQuery = supabase
      .from("ai_insights")
      .select("id, focus_area, headline, narrative, recommendations")
      .eq("subject_profile_id", body.profileId)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: selectedInsight, error: insightError } = body.insightId
      ? await supabase
          .from("ai_insights")
          .select("id, focus_area, headline, narrative, recommendations")
          .eq("id", body.insightId)
          .maybeSingle()
      : await insightQuery.maybeSingle();

    if (insightError && insightError.code !== "PGRST116") {
      throw insightError;
    }

    const { data: sentiments, error: sentimentsError } = await supabase
      .from("client_sentiment_entries")
      .select("mood_score, energy_score")
      .eq("profile_id", body.profileId)
      .order("recorded_at", { ascending: false })
      .limit(10);

    if (sentimentsError) {
      throw sentimentsError;
    }

    const sentimentWindow = (sentiments ?? []).slice(0, Math.max(MIN_SENTIMENT_ENTRIES, 1));
    const avgMood =
      sentimentWindow.length >= Math.max(MIN_SENTIMENT_ENTRIES, 1)
        ? sentimentWindow.reduce((acc, entry) => acc + (entry.mood_score ?? 0), 0) /
          sentimentWindow.length
        : null;

    const agendaDate = new Date();
    const isoDate = agendaDate.toISOString().slice(0, 10);

    const { data: agendaDay, error: dayError } = await supabase
      .from("agenda_days")
      .upsert({
        profile_id: body.profileId,
        agenda_date: isoDate,
        status: "planificado",
        ai_generated: true,
      }, { onConflict: "profile_id,agenda_date" })
      .select("id")
      .single();

    if (dayError || !agendaDay) throw dayError;

    const adjustments: Array<{ title: string; description: string; item_type: string; premium?: boolean }> = [];

    if (selectedInsight) {
      const focus = (selectedInsight.focus_area ?? "").toLowerCase();
      if (focus.includes("nutrition")) {
        adjustments.push({
          title: "Planifica hidratación",
          description: "Aumenta tu consumo de agua a 35 ml por kg. Programa recordatorios cada 2 horas.",
          item_type: "habito",
        });
      }
      if (focus.includes("movement") || focus.includes("actividad") || focus.includes("entrenamiento")) {
        adjustments.push({
          title: "Sesión de movilidad guiada",
          description: "Integra 15 minutos de movilidad enfocada en caderas y espalda antes de tu entrenamiento principal.",
          item_type: "movimiento",
          premium: true,
        });
      }
      if (Array.isArray(selectedInsight.recommendations)) {
        for (const rec of selectedInsight.recommendations.slice(0, Math.max(MAX_RECOMMENDATIONS, 1))) {
          const text = typeof rec === "string" ? rec : `${rec.title ?? "Recomendación"}: ${rec.detail ?? ""}`;
          adjustments.push({
            title: typeof rec === "string" ? "Recomendación" : rec.title ?? "Recomendación",
            description: text,
            item_type: "nota",
          });
        }
      }
    }

    if (avgMood !== null && avgMood < LOW_MOOD_THRESHOLD) {
      adjustments.push({
        title: "Respiración consciente",
        description: "Programa una pausa de respiración 4-7-8 por la tarde para mejorar tu regulación emocional.",
        item_type: "mindfulness",
      });
    }

    if (adjustments.length === 0) {
      adjustments.push({
        title: "Chequeo rápido",
        description: "Revisa tus métricas recientes y confirma si necesitas soporte del coach.",
        item_type: "revisión",
      });
    }

    const agendaPayload = adjustments.map((item) => ({
      agenda_day_id: agendaDay.id,
      item_type: item.item_type,
      title: item.title,
      description: item.description,
      completion_state: "pendiente",
      recommended: true,
      premium: item.premium ?? false,
      ai_source_insight: selectedInsight?.id ?? body.insightId ?? null,
    }));

    const { data: insertedItems } = await supabase
      .from("agenda_items")
      .insert(agendaPayload)
      .select("id, title");

    if (insertedItems && insertedItems.length > 0) {
      for (const item of insertedItems) {
        await supabase.from("agenda_item_logs").insert({
          agenda_item_id: item.id,
          log_type: "auto_adjustment",
          note: `Ajustado automáticamente por ${requester.user.email ?? "el sistema"}`,
          created_by: requester.user.id,
        });
      }
    }

    return new Response(
      JSON.stringify({ inserted: insertedItems?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("[apply-lifestyle-adjustments]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
