import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { subDays } from 'date-fns';

export interface TelemetryMetricDefinition {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  unit: string | null;
  description: string | null;
  precision: number | null;
}

export interface TelemetrySample {
  id: string;
  metric_id: string;
  profile_id: string;
  recorded_for: string | null;
  recorded_at: string;
  source: string | null;
  value_numeric: number | null;
  value_text: string | null;
  value_json: Record<string, unknown> | null;
  note: string | null;
}

export interface TelemetryMetric {
  definition: TelemetryMetricDefinition;
  samples: TelemetrySample[];
  latestSample: TelemetrySample | null;
}

export interface BehaviorStreak {
  id: string;
  profile_id: string;
  habit_slug: string;
  habit_name: string | null;
  current_streak: number;
  longest_streak: number;
  updated_at: string;
}

export interface SentimentEntry {
  id: string;
  profile_id: string;
  mood_score: number | null;
  energy_score: number | null;
  note: string | null;
  recorded_at: string;
}

export interface WearableConnection {
  id: string;
  profile_id: string;
  provider: string;
  status: string;
  last_synced_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientMilestone {
  id: string;
  profile_id: string;
  title: string;
  description: string | null;
  category: string | null;
  milestone_date: string | null;
  status: 'achieved' | 'upcoming' | 'at-risk';
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface UseTelemetryOptions {
  timeframeDays?: number;
  skip?: boolean;
}

interface UseTelemetryState {
  loading: boolean;
  metrics: TelemetryMetric[];
  streaks: BehaviorStreak[];
  sentiments: SentimentEntry[];
  wearables: WearableConnection[];
  milestones: ClientMilestone[];
}

type SupabaseSampleRow = TelemetrySample & {
  wellness_metrics: TelemetryMetricDefinition | null;
};

const initialState: UseTelemetryState = {
  loading: false,
  metrics: [],
  streaks: [],
  sentiments: [],
  wearables: [],
  milestones: [],
};

export const useTelemetry = (
  profileId: string | null,
  options: UseTelemetryOptions = {},
) => {
  const { timeframeDays = 30, skip = false } = options;
  const [state, setState] = useState<UseTelemetryState>(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchTelemetry = useCallback(async () => {
    if (!profileId || skip) {
      setState({ ...initialState, loading: false });
      setIsRefreshing(false);
      return;
    }

    setState((current) => ({ ...current, loading: true }));
    setIsRefreshing(true);
    const sinceDate = subDays(new Date(), timeframeDays);
    const sinceDateString = sinceDate.toISOString().slice(0, 10);

    try {
      const [
        { data: samplesData, error: samplesError },
        { data: streaksData, error: streaksError },
        { data: sentimentsData, error: sentimentsError },
        { data: wearablesData, error: wearablesError },
        { data: milestonesData, error: milestonesError },
      ] = await Promise.all([
        supabase
          .from('wellness_metric_samples')
          .select(`
            id,
            metric_id,
            profile_id,
            recorded_for,
            recorded_at,
            source,
            value_numeric,
            value_text,
            value_json,
            note,
            wellness_metrics (
              id,
              slug,
              display_name,
              category,
              unit,
              description,
              precision
            )
          `)
          .eq('profile_id', profileId)
          .gte('recorded_for', sinceDateString)
          .order('recorded_for', { ascending: true })
          .order('recorded_at', { ascending: true }),
        supabase
          .from('client_behavior_streaks')
          .select('*')
          .eq('profile_id', profileId)
          .order('habit_name', { ascending: true }),
        supabase
          .from('client_sentiment_entries')
          .select('*')
          .eq('profile_id', profileId)
          .gte('recorded_at', subDays(new Date(), timeframeDays).toISOString())
          .order('recorded_at', { ascending: true }),
        supabase
          .from('wearable_connections')
          .select('*')
          .eq('profile_id', profileId)
          .order('provider', { ascending: true }),
        supabase
          .from('client_milestones')
          .select('*')
          .eq('profile_id', profileId)
          .order('milestone_date', { ascending: true })
          .limit(12),
      ]);

      if (samplesError || streaksError || sentimentsError || wearablesError || milestonesError) {
        throw samplesError || streaksError || sentimentsError || wearablesError || milestonesError;
      }

      const metricMap = new Map<string, TelemetryMetric>();

      const typedSamples = (samplesData ?? []) as SupabaseSampleRow[];

      typedSamples.forEach((row) => {
        if (!row.wellness_metrics) {
          return;
        }

        const definition: TelemetryMetricDefinition = {
          id: row.wellness_metrics.id,
          slug: row.wellness_metrics.slug,
          display_name: row.wellness_metrics.display_name,
          category: row.wellness_metrics.category,
          unit: row.wellness_metrics.unit,
          description: row.wellness_metrics.description,
          precision: row.wellness_metrics.precision,
        };

        const sample: TelemetrySample = {
          id: row.id,
          metric_id: row.metric_id,
          profile_id: row.profile_id,
          recorded_for: row.recorded_for,
          recorded_at: row.recorded_at,
          source: row.source,
          value_numeric: row.value_numeric,
          value_text: row.value_text,
          value_json: row.value_json,
          note: row.note,
        };

        const existing = metricMap.get(row.metric_id);
        if (!existing) {
          metricMap.set(row.metric_id, {
            definition,
            samples: [sample],
            latestSample: sample,
          });
        } else {
          existing.samples.push(sample);
          const latest = existing.latestSample;
          const currentTimestamp = new Date(latest?.recorded_for || latest?.recorded_at || 0).getTime();
          const incomingTimestamp = new Date(sample.recorded_for || sample.recorded_at || 0).getTime();
          if (!latest || incomingTimestamp >= currentTimestamp) {
            existing.latestSample = sample;
          }
        }
      });

      const metrics: TelemetryMetric[] = Array.from(metricMap.values()).map((metric) => ({
        ...metric,
        samples: metric.samples.sort((a, b) => {
          const aDate = new Date(a.recorded_for || a.recorded_at).getTime();
          const bDate = new Date(b.recorded_for || b.recorded_at).getTime();
          return aDate - bDate;
        }),
        latestSample: metric.samples
          .slice()
          .sort((a, b) => {
            const aDate = new Date(a.recorded_for || a.recorded_at).getTime();
            const bDate = new Date(b.recorded_for || b.recorded_at).getTime();
            return bDate - aDate;
          })[0] || null,
      }));

      setState({
        loading: false,
        metrics,
        streaks: (streaksData ?? []) as BehaviorStreak[],
        sentiments: (sentimentsData ?? []) as SentimentEntry[],
        wearables: (wearablesData ?? []) as WearableConnection[],
        milestones: (milestonesData ?? []) as ClientMilestone[],
      });
    } catch (error) {
      console.error('Error loading telemetry data', error);
      toast({
        title: 'No se pudieron cargar los indicadores',
        description: 'Revisa tu conexión o vuelve a intentarlo en unos minutos.',
        variant: 'destructive',
      });
      setState({ ...initialState, loading: false });
    } finally {
      setIsRefreshing(false);
    }
  }, [profileId, skip, timeframeDays, toast]);

  useEffect(() => {
    if (!profileId || skip) {
      setState({ ...initialState, loading: false });
      setIsRefreshing(false);
      return;
    }

    setState((current) => ({ ...current, loading: true }));
    fetchTelemetry();
  }, [fetchTelemetry, profileId, skip]);

  const refresh = useCallback(async () => {
    await fetchTelemetry();
  }, [fetchTelemetry]);

  const ingestTelemetry = useCallback(
    async (
      provider: 'apple_health' | 'google_fit' | 'lab_panel',
      metrics: Array<{ slug: string; value: number | string | Record<string, unknown>; recordedAt: string; unit?: string | null; note?: string | null }>,
    ) => {
      if (!profileId) {
        throw new Error('Selecciona un perfil antes de sincronizar');
      }

      try {
        const { data, error } = await supabase.functions.invoke('ingest-telemetry', {
          body: {
            provider,
            profileId,
            metrics,
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data && typeof data === 'object' && 'error' in data && data.error) {
          throw new Error(String((data as { error: unknown }).error));
        }

        await fetchTelemetry();
        return data as { inserted?: number } | null;
      } catch (error) {
        console.error('Error ingesting telemetry payload', error);
        throw error instanceof Error
          ? error
          : new Error('No se pudo sincronizar la telemetría con el proveedor seleccionado');
      }
    },
    [fetchTelemetry, profileId],
  );

  const hasData = useMemo(() => {
    return (
      state.metrics.length > 0 ||
      state.streaks.length > 0 ||
      state.sentiments.length > 0 ||
      state.wearables.length > 0 ||
      state.milestones.length > 0
    );
  }, [state.metrics.length, state.streaks.length, state.sentiments.length, state.wearables.length, state.milestones.length]);

  return {
    ...state,
    hasData,
    refresh,
    ingestTelemetry,
    isRefreshing,
  };
};

