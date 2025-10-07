import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSecurityStatus } from "@/hooks/useSecurity";
import { useSubscription } from "@/hooks/useSubscription";

export interface AiInsightCard {
  id: string;
  card_type: string;
  headline: string;
  body: string | null;
  cta_label: string | null;
}

export interface AiEscalation {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AiInsight {
  id: string;
  focus_area: string;
  headline: string;
  narrative: string | null;
  recommendations: Array<{ title?: string; detail?: string } | string> | null;
  confidence: number | null;
  risk_level: string | null;
  requires_follow_up: boolean;
  created_at: string;
  cards: AiInsightCard[];
  escalations: AiEscalation[];
}

export interface AiCoachState {
  hasAccess: boolean;
  requiresMfa: boolean;
  insights: AiInsight[];
  lastGeneratedAt: string | null;
  subscriptionTier: string | null | undefined;
}

const parseRecommendations = (value: unknown) => {
  if (!value) return [];
  if (Array.isArray(value)) return value as AiCoachState["insights"][number]["recommendations"];
  if (typeof value === "object") return [value as Record<string, unknown>];
  return [{ title: "Recomendación", detail: String(value) }];
};

export const useAiCoach = (subjectProfileId: string | null) => {
  const { user, profile } = useAuth();
  const { subscriptionStatus } = useSubscription();
  const { data: securityStatus } = useSecurityStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ai-coach", subjectProfileId],
    queryFn: async () => {
      if (!subjectProfileId) {
        return { insights: [], lastGeneratedAt: null };
      }

      const { data, error } = await supabase
        .from("ai_insights")
        .select(
          `id, focus_area, headline, narrative, recommendations, confidence, risk_level, requires_follow_up, created_at,
           ai_insight_cards (id, card_type, headline, body, cta_label),
           ai_escalations (id, status, reason, created_at, resolved_at)`
        )
        .eq("subject_profile_id", subjectProfileId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) throw error;

      const insights: AiInsight[] = (data ?? []).map((insight) => ({
        id: insight.id,
        focus_area: insight.focus_area,
        headline: insight.headline,
        narrative: insight.narrative,
        recommendations: parseRecommendations(insight.recommendations),
        confidence: insight.confidence,
        risk_level: insight.risk_level,
        requires_follow_up: insight.requires_follow_up,
        created_at: insight.created_at,
        cards: insight.ai_insight_cards ?? [],
        escalations: insight.ai_escalations ?? []
      }));

      return {
        insights,
        lastGeneratedAt: insights.length > 0 ? insights[0].created_at : null
      };
    },
    enabled: Boolean(subjectProfileId && user?.id)
  });

  const hasAccess = useMemo(() => {
    if (profile?.role === "coach" || profile?.role === "admin") {
      return true;
    }
    const subscribed = Boolean(subscriptionStatus.subscribed);
    const tier = subscriptionStatus.subscription_tier;
    const tierAllows = tier === "ai" || tier === "premium" || tier === "enterprise";
    return subscribed && tierAllows;
  }, [profile?.role, subscriptionStatus.subscribed, subscriptionStatus.subscription_tier]);

  const requiresMfa = useMemo(() => {
    if (!securityStatus) return true;
    return securityStatus.mfaRequired && !securityStatus.mfaEnrolled;
  }, [securityStatus]);

  const logEvent = useMutation({
    mutationFn: async (payload: { event_type: string; metadata?: Record<string, unknown>; subject?: string | null }) => {
      if (!user?.id) throw new Error("Usuario no autenticado");
      const { error } = await supabase.from("ai_usage_events").insert({
        actor_user_id: user.id,
        subject_profile_id: payload.subject ?? subjectProfileId,
        event_type: payload.event_type,
        metadata: payload.metadata ?? {}
      });
      if (error) throw error;
    }
  });

  const escalateInsight = useMutation({
    mutationFn: async ({ insightId, reason }: { insightId: string; reason?: string }) => {
      if (!user?.id) throw new Error("Usuario no autenticado");
      const { error } = await supabase.from("ai_escalations").insert({
        insight_id: insightId,
        escalated_by: user.id,
        reason: reason ?? null
      });
      if (error) throw error;
      await logEvent.mutateAsync({
        event_type: "escalation_created",
        metadata: { insightId },
        subject: subjectProfileId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-coach", subjectProfileId] });
      toast({
        title: "Escalación enviada", 
        description: "Tu coach revisará esta recomendación y dará seguimiento."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo escalar",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ insightId, rating, comment }: { insightId: string; rating: number; comment?: string }) => {
      if (!user?.id || !subjectProfileId) throw new Error("Faltan datos para enviar retroalimentación");
      const { data: reviewerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!reviewerProfile) throw new Error("No se encontró el perfil");

      const { error } = await supabase.from("ai_insight_feedback").insert({
        insight_id: insightId,
        reviewer_profile_id: reviewerProfile.id,
        rating,
        comment: comment ?? null
      });
      if (error) throw error;
      await logEvent.mutateAsync({
        event_type: "feedback_submitted",
        metadata: { insightId, rating },
        subject: subjectProfileId
      });
    },
    onSuccess: () => {
      toast({
        title: "Gracias por tu feedback",
        description: "Lo usaremos para mejorar las próximas recomendaciones."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo enviar el feedback",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const requestRefresh = useMutation({
    mutationFn: async () => {
      if (!subjectProfileId) {
        throw new Error("No hay perfil seleccionado para generar insights");
      }
      await logEvent.mutateAsync({
        event_type: "insight_refresh_requested",
        subject: subjectProfileId,
        metadata: { requestedAt: new Date().toISOString() }
      });

      const { data, error } = await supabase.functions.invoke("gemini-insights", {
        body: { subjectProfileId }
      });

      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }
      return data as { insight_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-coach", subjectProfileId] });
      toast({
        title: "Nuevo insight disponible",
        description: "Gemini analizó tus últimos datos para ofrecer recomendaciones actualizadas."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo generar el insight",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  return {
    ...query,
    hasAccess,
    requiresMfa,
    subscriptionTier: subscriptionStatus.subscription_tier,
    escalateInsight: escalateInsight.mutateAsync,
    submitFeedback: submitFeedback.mutateAsync,
    requestRefresh: requestRefresh.mutateAsync,
    logging: logEvent
  };
};
