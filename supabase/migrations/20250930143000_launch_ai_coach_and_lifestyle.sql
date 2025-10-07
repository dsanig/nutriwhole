-- Launch Gemini AI coach tier and lifestyle programming foundations
set check_function_bodies = off;

-- AI coach core tables
create table if not exists public.ai_coach_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coach_profile_id uuid references public.profiles (id) on delete set null,
  coaching_focus text[] default array[]::text[],
  preferred_tone text default 'balanceado',
  notifications_enabled boolean default true,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ai_coach_profiles_user_id_idx on public.ai_coach_profiles (user_id);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  locale text not null default 'es-ES',
  description text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  subject_profile_id uuid not null references public.profiles (id) on delete cascade,
  generated_by text not null default 'gemini',
  focus_area text not null,
  headline text not null,
  narrative text,
  recommendations jsonb default '[]'::jsonb,
  confidence numeric,
  risk_level text,
  requires_follow_up boolean default false,
  ai_version text default 'gemini-1.5-pro',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ai_insights_subject_idx on public.ai_insights (subject_profile_id, created_at desc);
create index if not exists ai_insights_focus_idx on public.ai_insights (focus_area);

create table if not exists public.ai_insight_cards (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.ai_insights (id) on delete cascade,
  card_type text not null,
  headline text not null,
  body text,
  cta_label text,
  created_at timestamptz default now()
);

create table if not exists public.ai_insight_feedback (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.ai_insights (id) on delete cascade,
  reviewer_profile_id uuid references public.profiles (id) on delete set null,
  rating smallint,
  comment text,
  created_at timestamptz default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  subject_profile_id uuid references public.profiles (id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists ai_usage_events_actor_idx on public.ai_usage_events (actor_user_id, created_at desc);
create index if not exists ai_usage_events_subject_idx on public.ai_usage_events (subject_profile_id, created_at desc);

create table if not exists public.ai_escalations (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.ai_insights (id) on delete cascade,
  escalated_by uuid not null references auth.users (id) on delete cascade,
  coach_profile_id uuid references public.profiles (id) on delete set null,
  reason text,
  status text not null default 'pendiente',
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists ai_escalations_status_idx on public.ai_escalations (status, created_at desc);

create table if not exists public.ai_guardrail_events (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid references public.ai_insights (id) on delete set null,
  event_type text not null,
  severity text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Lifestyle programming tables
create table if not exists public.lifestyle_domains (
  id uuid primary key default gen_random_uuid(),
  domain_key text not null unique,
  name text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.lifestyle_modules (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.lifestyle_domains (id) on delete cascade,
  module_key text not null unique,
  title text not null,
  summary text,
  tier text not null default 'core',
  estimated_minutes integer,
  created_at timestamptz default now()
);

create table if not exists public.lifestyle_content (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.lifestyle_modules (id) on delete cascade,
  slug text not null unique,
  title text not null,
  content_type text not null,
  excerpt text,
  media_url text,
  goal_tags text[] default array[]::text[],
  tier text not null default 'core',
  duration_minutes integer,
  created_at timestamptz default now()
);

create table if not exists public.agenda_days (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  agenda_date date not null,
  status text not null default 'planificado',
  ai_generated boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists agenda_days_profile_date_idx on public.agenda_days (profile_id, agenda_date);

create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  agenda_day_id uuid not null references public.agenda_days (id) on delete cascade,
  module_id uuid references public.lifestyle_modules (id) on delete set null,
  item_type text not null,
  title text not null,
  description text,
  start_time time,
  end_time time,
  completion_state text not null default 'pendiente',
  recommended boolean default false,
  premium boolean default false,
  ai_source_insight uuid references public.ai_insights (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agenda_item_logs (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null references public.agenda_items (id) on delete cascade,
  log_type text not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.habit_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.lifestyle_modules (id) on delete cascade,
  streak_count integer not null default 0,
  last_completed_at timestamptz,
  updated_at timestamptz default now(),
  constraint habit_progress_unique unique (profile_id, module_id)
);

create table if not exists public.content_unlocks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.lifestyle_content (id) on delete cascade,
  unlocked_at timestamptz default now(),
  source text,
  constraint content_unlocks_unique unique (profile_id, content_id)
);

-- Seed baseline lifestyle domains/modules/content for onboarding
insert into public.lifestyle_domains (domain_key, name, description)
values
  ('nutrition', 'Nutrición', 'Planes de alimentación y educación nutricional'),
  ('movement', 'Movimiento', 'Entrenamientos y movilidad diaria'),
  ('mindfulness', 'Mindfulness', 'Respiración, enfoque y resiliencia'),
  ('recovery', 'Recuperación', 'Sueño, hidratación y descanso')
on conflict (domain_key) do nothing;

insert into public.lifestyle_modules (domain_id, module_key, title, summary, tier, estimated_minutes)
select id, module_key, title, summary, tier, estimated_minutes
from (
  values
    ('nutrition', 'macro-reset', 'Reajuste de macros', 'Revisión semanal de macronutrientes con ajustes automatizados', 'core', 20),
    ('movement', 'mobility-micro', 'Micro movilidad', 'Secuencia corta de movilidad para romper el sedentarismo', 'core', 10),
    ('mindfulness', 'breath-4-7-8', 'Respiración 4-7-8', 'Rutina guiada para regular el sistema nervioso', 'core', 5),
    ('recovery', 'sleep-winddown', 'Rutina de sueño', 'Checklist nocturna para optimizar la higiene del sueño', 'premium', 15)
) as seed(domain_key, module_key, title, summary, tier, estimated_minutes)
join public.lifestyle_domains d on d.domain_key = seed.domain_key
on conflict (module_key) do update
  set title = excluded.title,
      summary = excluded.summary,
      tier = excluded.tier,
      estimated_minutes = excluded.estimated_minutes,
      domain_id = excluded.domain_id;

insert into public.lifestyle_content (module_id, slug, title, content_type, excerpt, media_url, goal_tags, tier, duration_minutes)
select module_id, slug, title, content_type, excerpt, media_url, goal_tags, tier, duration_minutes
from (
  values
    ('macro-reset', 'guia-macro-basica', 'Guía de macros esenciales', 'article', 'Cómo equilibrar proteínas, carbohidratos y grasas con ejemplos locales.', null, array['pérdida de peso','rendimiento'], 'core', 8),
    ('mobility-micro', 'video-movilidad-espalda', 'Movilidad exprés para espalda', 'video', 'Secuencia guiada para aliviar tensión lumbar.', 'https://cdn.nutriwhole.example/movilidad-espalda.mp4', array['dolor','energia'], 'core', 6),
    ('breath-4-7-8', 'audio-respiracion-478', 'Audio respiración 4-7-8', 'audio', 'Instrucciones guiadas para el patrón 4-7-8.', 'https://cdn.nutriwhole.example/respiracion-478.mp3', array['estrés','sueño'], 'core', 5),
    ('sleep-winddown', 'checklist-higiene-sueno', 'Checklist de higiene del sueño', 'checklist', 'Pasos concretos para preparar el descanso nocturno.', null, array['sueño','recuperación'], 'premium', 7)
) as content(module_key, slug, title, content_type, excerpt, media_url, goal_tags, tier, duration_minutes)
join public.lifestyle_modules m on m.module_key = content.module_key
on conflict (slug) do update
  set title = excluded.title,
      excerpt = excluded.excerpt,
      media_url = excluded.media_url,
      goal_tags = excluded.goal_tags,
      tier = excluded.tier,
      duration_minutes = excluded.duration_minutes,
      module_id = excluded.module_id;

-- Enable RLS and define baseline policies
alter table public.ai_coach_profiles enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_insights enable row level security;
alter table public.ai_insight_cards enable row level security;
alter table public.ai_insight_feedback enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_escalations enable row level security;
alter table public.ai_guardrail_events enable row level security;
alter table public.lifestyle_domains enable row level security;
alter table public.lifestyle_modules enable row level security;
alter table public.lifestyle_content enable row level security;
alter table public.agenda_days enable row level security;
alter table public.agenda_items enable row level security;
alter table public.agenda_item_logs enable row level security;
alter table public.habit_progress enable row level security;
alter table public.content_unlocks enable row level security;

create policy if not exists "read ai templates" on public.ai_prompt_templates
  for select using (auth.role() = 'service_role');

create policy if not exists "manage own ai coach profile" on public.ai_coach_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "read own ai insights" on public.ai_insights
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = public.ai_insights.subject_profile_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "insert ai insights via service" on public.ai_insights
  for insert with check (auth.role() = 'service_role');

create policy if not exists "update ai insights via service" on public.ai_insights
  for update using (auth.role() = 'service_role');

create policy if not exists "read ai insight cards" on public.ai_insight_cards
  for select using (
    exists (
      select 1
      from public.ai_insights i
      join public.profiles p on p.id = i.subject_profile_id
      where i.id = public.ai_insight_cards.insight_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "submit ai feedback" on public.ai_insight_feedback
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = reviewer_profile_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "read ai feedback" on public.ai_insight_feedback
  for select using (
    exists (
      select 1
      from public.ai_insights i
      join public.profiles p on p.id = i.subject_profile_id
      where i.id = public.ai_insight_feedback.insight_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "log ai usage" on public.ai_usage_events
  for insert with check (auth.uid() = actor_user_id);

create policy if not exists "read ai usage for subject" on public.ai_usage_events
  for select using (
    subject_profile_id is null or exists (
      select 1
      from public.profiles p
      where p.id = public.ai_usage_events.subject_profile_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "escalate insights" on public.ai_escalations
  for insert with check (auth.uid() = escalated_by);

create policy if not exists "read escalations" on public.ai_escalations
  for select using (
    exists (
      select 1
      from public.ai_insights i
      join public.profiles p on p.id = i.subject_profile_id
      where i.id = public.ai_escalations.insight_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "service guardrail events" on public.ai_guardrail_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy if not exists "read lifestyle reference" on public.lifestyle_domains
  for select using (true);

create policy if not exists "read lifestyle modules" on public.lifestyle_modules
  for select using (true);

create policy if not exists "read lifestyle content" on public.lifestyle_content
  for select using (true);

create policy if not exists "manage own agenda days" on public.agenda_days
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = public.agenda_days.profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = public.agenda_days.profile_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists "coach read agenda days" on public.agenda_days
  for select using (
    exists (
      select 1
      from public.profiles client
      join public.profiles coach on coach.id = client.coach_id
      where client.id = public.agenda_days.profile_id
        and coach.user_id = auth.uid()
    )
  );

create policy if not exists "manage own agenda items" on public.agenda_items
  for all using (
    exists (
      select 1
      from public.agenda_days d
      join public.profiles p on p.id = d.profile_id
      where d.id = public.agenda_items.agenda_day_id
        and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.agenda_days d
      join public.profiles p on p.id = d.profile_id
      where d.id = public.agenda_items.agenda_day_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists "coach read agenda items" on public.agenda_items
  for select using (
    exists (
      select 1
      from public.agenda_days d
      join public.profiles client on client.id = d.profile_id
      join public.profiles coach on coach.id = client.coach_id
      where d.id = public.agenda_items.agenda_day_id
        and coach.user_id = auth.uid()
    )
  );

create policy if not exists "log agenda updates" on public.agenda_item_logs
  for insert with check (
    exists (
      select 1
      from public.agenda_items i
      join public.agenda_days d on d.id = i.agenda_day_id
      join public.profiles p on p.id = d.profile_id
      where i.id = public.agenda_item_logs.agenda_item_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "read agenda logs" on public.agenda_item_logs
  for select using (
    exists (
      select 1
      from public.agenda_items i
      join public.agenda_days d on d.id = i.agenda_day_id
      join public.profiles p on p.id = d.profile_id
      where i.id = public.agenda_item_logs.agenda_item_id
        and (p.user_id = auth.uid() or p.coach_id = auth.uid())
    )
  );

create policy if not exists "manage own habit progress" on public.habit_progress
  for all using (
    exists (
      select 1
      from public.profiles p
      where p.id = public.habit_progress.profile_id
        and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.profiles p
      where p.id = public.habit_progress.profile_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists "coach read habit progress" on public.habit_progress
  for select using (
    exists (
      select 1
      from public.profiles client
      join public.profiles coach on coach.id = client.coach_id
      where client.id = public.habit_progress.profile_id
        and coach.user_id = auth.uid()
    )
  );

create policy if not exists "manage content unlocks" on public.content_unlocks
  for all using (
    exists (
      select 1
      from public.profiles p
      where p.id = public.content_unlocks.profile_id
        and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.profiles p
      where p.id = public.content_unlocks.profile_id
        and p.user_id = auth.uid()
    )
  );

comment on table public.ai_insights is 'Gemini-generated insights contextualized to client telemetry.';
comment on table public.agenda_items is 'Unified lifestyle agenda entries combining nutrition, movement, mindfulness and recovery.';

