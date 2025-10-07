-- Finalize security, telemetry automation, and connector scaffolding
begin;

-- Ensure pg_net is available for background HTTP dispatches used by automation hooks
create extension if not exists pg_net with schema public;

-- ---------------------------------------------------------------------------
-- Passkey (WebAuthn) artifacts
-- ---------------------------------------------------------------------------
create table if not exists public.mfa_webauthn_challenges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge text not null,
  challenge_type text not null check (challenge_type in ('registration', 'authentication')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mfa_webauthn_challenges_lookup_idx
  on public.mfa_webauthn_challenges (user_id, challenge_type, expires_at desc);

create table if not exists public.mfa_passkeys (
  id uuid primary key default uuid_generate_v4(),
  factor_id uuid not null references public.mfa_factors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  transports text[],
  sign_count bigint not null default 0,
  attestation_format text,
  aa_guid text,
  friendly_name text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mfa_passkeys_set_timestamp
  before update on public.mfa_passkeys
  for each row
  execute procedure public.set_current_timestamp_updated_at();

alter table public.mfa_passkeys enable row level security;

create policy if not exists "service manage passkeys" on public.mfa_passkeys
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view public.mfa_passkey_summaries as
  select
    pk.id,
    pk.user_id,
    f.friendly_name,
    pk.credential_id,
    pk.transports,
    pk.sign_count,
    pk.last_used_at,
    pk.created_at,
    pk.updated_at
  from public.mfa_passkeys pk
  join public.mfa_factors f on f.id = pk.factor_id;

grant select on public.mfa_passkey_summaries to authenticated;

alter view public.mfa_passkey_summaries set (security_invoker = on);

create policy if not exists "read own passkeys" on public.mfa_passkey_summaries
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Wearable connector credentials & telemetry automation queue
-- ---------------------------------------------------------------------------
alter table public.wearable_connections
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text[],
  add column if not exists last_error text,
  add column if not exists sync_frequency_minutes integer default 180;

create table if not exists public.telemetry_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.wearable_connections (id) on delete cascade,
  provider text not null,
  status text not null check (status in ('pending', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  payload jsonb default '{}'::jsonb
);

create index if not exists telemetry_sync_runs_conn_idx
  on public.telemetry_sync_runs (connection_id, started_at desc);

create table if not exists public.automation_events (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  run_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_events_lookup_idx
  on public.automation_events (status, run_at asc);

create trigger automation_events_set_timestamp
  before update on public.automation_events
  for each row
  execute procedure public.set_current_timestamp_updated_at();

alter table public.automation_events enable row level security;

create policy if not exists "service manage automation" on public.automation_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.enqueue_automation_event(
  p_profile_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_delay_seconds integer default 0
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.automation_events (profile_id, event_type, payload, run_at)
  values (p_profile_id, p_event_type, coalesce(p_payload, '{}'::jsonb), now() + make_interval(secs => p_delay_seconds))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.enqueue_automation_event(uuid, text, jsonb, integer) to service_role;

-- Automatically queue lifestyle adjustments whenever new telemetry samples arrive
create or replace function public.enqueue_lifestyle_adjustment_from_metric()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.enqueue_automation_event(new.profile_id, 'lifestyle_adjustment', jsonb_build_object('metric_sample_id', new.id), 30);
  return new;
end;
$$;

create trigger lifestyle_adjustment_on_metric
  after insert on public.wellness_metric_samples
  for each row
  execute procedure public.enqueue_lifestyle_adjustment_from_metric();

-- ---------------------------------------------------------------------------
-- Views to expose automation status to clients and coaches
-- ---------------------------------------------------------------------------
create or replace view public.automation_event_summaries as
  select
    e.id,
    e.profile_id,
    p.user_id,
    e.event_type,
    e.status,
    e.run_at,
    e.created_at,
    e.updated_at,
    e.error_message
  from public.automation_events e
  join public.profiles p on p.id = e.profile_id;

grant select on public.automation_event_summaries to authenticated;

alter view public.automation_event_summaries set (security_invoker = on);

create policy if not exists "read own automation events" on public.automation_event_summaries
  for select using (auth.uid() = user_id);

commit;
