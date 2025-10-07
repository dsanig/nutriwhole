-- Elevate client telemetry & insights
-- 1. Metric catalog and samples covering anthropometrics, biometrics, habits, and sentiment

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metric_source') THEN
    CREATE TYPE public.metric_source AS ENUM ('manual', 'wearable', 'lab', 'coach', 'ai');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.wellness_metrics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('anthropometric', 'biometric', 'behavioral', 'sentiment')),
  unit text,
  description text,
  precision smallint DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wellness_metrics IS 'Catalog of wellness metrics available for clients and coaches.';
COMMENT ON COLUMN public.wellness_metrics.slug IS 'Unique identifier used by clients, coaches, and automations.';
COMMENT ON COLUMN public.wellness_metrics.precision IS 'Suggested decimal precision when displaying numeric values.';

CREATE UNIQUE INDEX IF NOT EXISTS wellness_metrics_slug_idx ON public.wellness_metrics (slug);

CREATE TABLE IF NOT EXISTS public.wellness_metric_samples (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_id uuid NOT NULL REFERENCES public.wellness_metrics (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recorded_for date,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source public.metric_source NOT NULL DEFAULT 'manual',
  value_numeric numeric,
  value_text text,
  value_json jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wellness_metric_samples_value_check CHECK (
    value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_json IS NOT NULL
  )
);

COMMENT ON TABLE public.wellness_metric_samples IS 'Time-series samples for each wellness metric captured for a profile.';
COMMENT ON COLUMN public.wellness_metric_samples.recorded_for IS 'Logical date the measurement corresponds to (e.g., sleep for 2024-09-30).';
COMMENT ON COLUMN public.wellness_metric_samples.source IS 'Origin of the data point (manual, wearable, lab, coach, ai).';

CREATE INDEX IF NOT EXISTS wellness_metric_samples_profile_date_idx
  ON public.wellness_metric_samples (profile_id, recorded_for DESC NULLS LAST, recorded_at DESC);
CREATE INDEX IF NOT EXISTS wellness_metric_samples_metric_idx ON public.wellness_metric_samples (metric_id);

-- 2. Behavior streaks, sentiment, wearable connections, and milestone tracking
CREATE TABLE IF NOT EXISTS public.client_behavior_streaks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  habit_slug text NOT NULL,
  habit_name text,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_behavior_streaks_unique UNIQUE (profile_id, habit_slug)
);

COMMENT ON TABLE public.client_behavior_streaks IS 'Rolling streak counters for recurring habits and routines.';

CREATE TABLE IF NOT EXISTS public.client_sentiment_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  mood_score integer CHECK (mood_score BETWEEN 0 AND 10),
  energy_score integer CHECK (energy_score BETWEEN 0 AND 10),
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_sentiment_entries IS 'Client-facing reflections that capture mood, energy, and notes over time.';

CREATE INDEX IF NOT EXISTS client_sentiment_entries_profile_idx
  ON public.client_sentiment_entries (profile_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.wearable_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('connected', 'pending', 'error')),
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wearable_connections_unique UNIQUE (profile_id, provider)
);

COMMENT ON TABLE public.wearable_connections IS 'Registered wearable or lab integrations connected to a profile.';

CREATE TABLE IF NOT EXISTS public.client_milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  milestone_date date,
  status text NOT NULL CHECK (status IN ('achieved', 'upcoming', 'at-risk')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_milestones IS 'Aggregated milestones and alerts derived from telemetry insights.';

CREATE INDEX IF NOT EXISTS client_milestones_profile_idx
  ON public.client_milestones (profile_id, milestone_date DESC NULLS LAST, status);

-- 3. Updated-at triggers reused across telemetry tables
DO $$
BEGIN
  IF to_regproc('public.set_current_timestamp_updated_at()') IS NOT NULL THEN
    PERFORM 1;
  ELSE
    CREATE FUNCTION public.set_current_timestamp_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$;
  END IF;
END$$;

CREATE TRIGGER wellness_metrics_set_timestamp
  BEFORE UPDATE ON public.wellness_metrics
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE TRIGGER wellness_metric_samples_set_timestamp
  BEFORE UPDATE ON public.wellness_metric_samples
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE TRIGGER client_behavior_streaks_set_timestamp
  BEFORE UPDATE ON public.client_behavior_streaks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE TRIGGER wearable_connections_set_timestamp
  BEFORE UPDATE ON public.wearable_connections
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE TRIGGER client_milestones_set_timestamp
  BEFORE UPDATE ON public.client_milestones
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 4. Helper functions to centralize access rules for telemetry assets
CREATE OR REPLACE FUNCTION public.is_profile_owner(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _profile_id
      AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_profile_artifacts(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(auth.uid())
    OR public.is_profile_owner(_profile_id)
    OR EXISTS (
      SELECT 1
      FROM public.clients_coaches cc
      JOIN public.profiles coach_profile ON coach_profile.id = cc.coach_id
      WHERE cc.client_id = _profile_id
        AND coach_profile.user_id = auth.uid()
    );
$$;

-- 5. Row level security policies aligning clients, coaches, and admins
ALTER TABLE public.wellness_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_metric_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_behavior_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sentiment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wearable_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view metric catalog" ON public.wellness_metrics;
CREATE POLICY "Authenticated can view metric catalog" ON public.wellness_metrics
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage wellness metrics" ON public.wellness_metrics;
CREATE POLICY "Admins manage wellness metrics" ON public.wellness_metrics
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Stakeholders view telemetry samples" ON public.wellness_metric_samples;
CREATE POLICY "Stakeholders view telemetry samples" ON public.wellness_metric_samples
  FOR SELECT
  USING (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders write telemetry samples" ON public.wellness_metric_samples;
CREATE POLICY "Stakeholders write telemetry samples" ON public.wellness_metric_samples
  FOR ALL
  USING (public.can_access_profile_artifacts(profile_id))
  WITH CHECK (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders view streaks" ON public.client_behavior_streaks;
CREATE POLICY "Stakeholders view streaks" ON public.client_behavior_streaks
  FOR SELECT
  USING (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders manage streaks" ON public.client_behavior_streaks;
CREATE POLICY "Stakeholders manage streaks" ON public.client_behavior_streaks
  FOR ALL
  USING (public.can_access_profile_artifacts(profile_id))
  WITH CHECK (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders view sentiment" ON public.client_sentiment_entries;
CREATE POLICY "Stakeholders view sentiment" ON public.client_sentiment_entries
  FOR SELECT
  USING (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders manage sentiment" ON public.client_sentiment_entries;
CREATE POLICY "Stakeholders manage sentiment" ON public.client_sentiment_entries
  FOR ALL
  USING (public.can_access_profile_artifacts(profile_id))
  WITH CHECK (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders view wearables" ON public.wearable_connections;
CREATE POLICY "Stakeholders view wearables" ON public.wearable_connections
  FOR SELECT
  USING (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Owners manage wearables" ON public.wearable_connections;
CREATE POLICY "Owners manage wearables" ON public.wearable_connections
  FOR ALL
  USING (public.is_profile_owner(profile_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_profile_owner(profile_id) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Stakeholders view milestones" ON public.client_milestones;
CREATE POLICY "Stakeholders view milestones" ON public.client_milestones
  FOR SELECT
  USING (public.can_access_profile_artifacts(profile_id));

DROP POLICY IF EXISTS "Stakeholders manage milestones" ON public.client_milestones;
CREATE POLICY "Stakeholders manage milestones" ON public.client_milestones
  FOR ALL
  USING (public.can_access_profile_artifacts(profile_id))
  WITH CHECK (public.can_access_profile_artifacts(profile_id));

-- 6. Seed baseline metric catalog entries to unblock dashboards
INSERT INTO public.wellness_metrics (slug, display_name, category, unit, description, precision)
VALUES
  ('body-weight', 'Peso corporal', 'anthropometric', 'kg', 'Seguimiento diario del peso corporal.', 1),
  ('body-fat', 'Grasa corporal', 'anthropometric', '%', 'Porcentaje estimado de grasa corporal.', 1),
  ('resting-heart-rate', 'Frecuencia cardíaca en reposo', 'biometric', 'ppm', 'Promedio diario del pulso en reposo.', 0),
  ('heart-rate-variability', 'Variabilidad de la frecuencia cardíaca', 'biometric', 'ms', 'HRV en milisegundos para evaluar recuperación.', 0),
  ('sleep-duration', 'Horas de sueño', 'biometric', 'h', 'Duración total del sueño registradas por wearables o diario.', 2),
  ('hydration', 'Hidratación diaria', 'biometric', 'L', 'Consumo total de líquidos.', 2),
  ('habit-adherence', 'Adherencia a hábitos', 'behavioral', '%', 'Porcentaje de hábitos completados durante el día.', 0),
  ('wellbeing-sentiment', 'Índice de bienestar', 'sentiment', null, 'Resumen ponderado del estado emocional reportado.', 1)
ON CONFLICT (slug) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  description = EXCLUDED.description,
  precision = EXCLUDED.precision;

