import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface LifestyleContent {
  id: string;
  title: string;
  content_type: string;
  excerpt: string | null;
  media_url: string | null;
  goal_tags: string[];
  tier: string;
  duration_minutes: number | null;
}

export interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  completion_state: string;
  start_time: string | null;
  end_time: string | null;
  recommended: boolean;
  premium: boolean;
  domain: string | null;
  module_title: string | null;
}

export interface AgendaDayData {
  agendaDayId: string | null;
  status: string | null;
  aiGenerated: boolean;
  items: AgendaItem[];
}

export interface LifestyleSnapshot {
  agenda: AgendaDayData;
  recommendedContent: LifestyleContent[];
  streaks: Array<{ module_id: string; module_title: string | null; streak_count: number }>;
}

export const useLifestyle = (profileId: string | null, dateIso: string) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const agendaQuery = useQuery({
    queryKey: ["lifestyle-agenda", profileId, dateIso],
    queryFn: async () => {
      if (!profileId) {
        return {
          agenda: { agendaDayId: null, status: null, aiGenerated: false, items: [] },
          recommendedContent: [],
          streaks: []
        } satisfies LifestyleSnapshot;
      }

      const { data: day, error: dayError } = await supabase
        .from("agenda_days")
        .select(
          `id, status, ai_generated,
           agenda_items (id, title, description, item_type, completion_state, start_time, end_time, recommended, premium, module_id,
             lifestyle_modules (title, lifestyle_domains (name))
           )`
        )
        .eq("profile_id", profileId)
        .eq("agenda_date", dateIso)
        .maybeSingle();

      if (dayError && dayError.code !== "PGRST116") {
        throw dayError;
      }

      const agendaItems: AgendaItem[] = (day?.agenda_items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        item_type: item.item_type,
        completion_state: item.completion_state,
        start_time: item.start_time,
        end_time: item.end_time,
        recommended: item.recommended,
        premium: item.premium,
        module_title: item.lifestyle_modules?.title ?? null,
        domain: item.lifestyle_modules?.lifestyle_domains?.name ?? null
      }));

      const { data: content, error: contentError } = await supabase
        .from("lifestyle_content")
        .select("id, title, content_type, excerpt, media_url, goal_tags, tier, duration_minutes, lifestyle_modules (title)")
        .order("tier", { ascending: true })
        .limit(6);

      if (contentError) throw contentError;

      const { data: streaks, error: streakError } = await supabase
        .from("habit_progress")
        .select("module_id, streak_count, lifestyle_modules (title)")
        .eq("profile_id", profileId)
        .order("streak_count", { ascending: false })
        .limit(5);

      if (streakError) throw streakError;

      return {
        agenda: {
          agendaDayId: day?.id ?? null,
          status: day?.status ?? null,
          aiGenerated: Boolean(day?.ai_generated),
          items: agendaItems
        },
        recommendedContent: (content ?? []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          content_type: entry.content_type,
          excerpt: entry.excerpt,
          media_url: entry.media_url,
          goal_tags: entry.goal_tags ?? [],
          tier: entry.tier,
          duration_minutes: entry.duration_minutes,
          module_title: entry.lifestyle_modules?.title ?? null
        })),
        streaks: (streaks ?? []).map((row) => ({
          module_id: row.module_id,
          module_title: row.lifestyle_modules?.title ?? null,
          streak_count: row.streak_count
        }))
      } satisfies LifestyleSnapshot;
    },
    enabled: Boolean(profileId)
  });

  const markAgendaItem = useMutation({
    mutationFn: async ({ itemId, state }: { itemId: string; state: "pendiente" | "completado" | "omitido" }) => {
      const { error } = await supabase
        .from("agenda_items")
        .update({ completion_state: state, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
      const { error: logError } = await supabase.from("agenda_item_logs").insert({
        agenda_item_id: itemId,
        log_type: "estado_actualizado",
        note: `Estado cambiado a ${state}`
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifestyle-agenda", profileId, dateIso] });
      toast({
        title: "Agenda actualizada",
        description: "Tu progreso quedó registrado."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo actualizar la agenda",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const unlockContent = useMutation({
    mutationFn: async ({ contentId }: { contentId: string }) => {
      if (!profileId) throw new Error("Falta el perfil");
      const { error } = await supabase.from("content_unlocks").insert({
        profile_id: profileId,
        content_id: contentId,
        source: "agenda"
      });
      if (error && error.code !== "23505") throw error;
      const { data: sessionData } = await supabase.auth.getSession();
      const actorId = sessionData.session?.user.id;
      if (!actorId) {
        return;
      }
      await supabase.from("ai_usage_events").insert({
        actor_user_id: actorId,
        subject_profile_id: profileId,
        event_type: "content_unlocked",
        metadata: { contentId }
      });
    },
    onSuccess: () => {
      toast({
        title: "Contenido guardado",
        description: "Lo encontrarás en tu biblioteca personalizada."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo guardar el contenido",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  const autoAdjust = useMutation({
    mutationFn: async ({ insightId }: { insightId?: string } = {}) => {
      if (!profileId) throw new Error("Falta el perfil");
      const { data, error } = await supabase.functions.invoke("apply-lifestyle-adjustments", {
        body: { profileId, insightId }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }

      return data as { inserted?: number } | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifestyle-agenda", profileId, dateIso] });
      toast({
        title: "Agenda reajustada",
        description: "Los bloques del día se adaptaron automáticamente."
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        title: "No se pudo ajustar la agenda",
        description: error instanceof Error ? error.message : "Intenta nuevamente"
      });
    }
  });

  return {
    ...agendaQuery,
    markAgendaItem: markAgendaItem.mutateAsync,
    unlockContent: unlockContent.mutateAsync,
    autoAdjust: autoAdjust.mutateAsync
  };
};
