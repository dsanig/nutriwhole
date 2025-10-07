-- Fortify security & account experience
-- 1. Extend profiles with MFA and Stripe alignment metadata
alter table public.profiles
  add column if not exists mfa_required boolean default true not null,
  add column if not exists mfa_enrolled boolean default false not null,
  add column if not exists mfa_verified_at timestamptz,
  add column if not exists stripe_mfa_synced_at timestamptz,
  add column if not exists last_active_at timestamptz;

comment on column public.profiles.mfa_required is 'Indicates if MFA is enforced for this profile.';
comment on column public.profiles.mfa_enrolled is 'Flag that shows whether the user finished MFA enrollment.';
comment on column public.profiles.mfa_verified_at is 'Timestamp of the last successful MFA challenge.';
comment on column public.profiles.stripe_mfa_synced_at is 'Last time we synced MFA status with Stripe metadata.';
comment on column public.profiles.last_active_at is 'Last activity timestamp captured from session hygiene checks.';

-- 2. Device trust and MFA enrollment artifacts
create table if not exists public.mfa_factors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_type text not null check (factor_type in ('totp', 'passkey')),
  friendly_name text,
  secret text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mfa_factors_user_id_idx on public.mfa_factors (user_id);

do $$
begin
  if to_regproc('public.set_current_timestamp_updated_at()') is null then
    create function public.set_current_timestamp_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  end if;
end$$;

create trigger mfa_factors_set_timestamp
  before update on public.mfa_factors
  for each row
  execute procedure public.set_current_timestamp_updated_at();

create table if not exists public.mfa_backup_codes (
  id uuid primary key default uuid_generate_v4(),
  factor_id uuid references public.mfa_factors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  consumed boolean not null default false,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_backup_codes_user_idx on public.mfa_backup_codes (user_id, consumed);

create table if not exists public.trusted_devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_fingerprint text not null,
  display_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists trusted_devices_unique on public.trusted_devices (user_id, device_fingerprint);

create table if not exists public.session_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists session_audit_logs_user_idx on public.session_audit_logs (user_id, created_at desc);

-- 3. RLS policies to keep security artifacts locked down
alter table public.mfa_factors enable row level security;
alter table public.mfa_backup_codes enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.session_audit_logs enable row level security;

create policy "Users read their own factors" on public.mfa_factors
  for select using (auth.uid() = user_id);

create policy "Users write their own factors" on public.mfa_factors
  for insert with check (auth.uid() = user_id)
  using (auth.uid() = user_id);

create policy "Users update their own factors" on public.mfa_factors
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own backup codes" on public.mfa_backup_codes
  for select using (auth.uid() = user_id);

create policy "Users insert their own backup codes" on public.mfa_backup_codes
  for insert with check (auth.uid() = user_id)
  using (auth.uid() = user_id);

create policy "Users update their own backup codes" on public.mfa_backup_codes
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own devices" on public.trusted_devices
  for select using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users insert their own devices" on public.trusted_devices
  for insert with check (auth.uid() = user_id)
  using (auth.uid() = user_id);

create policy "Users update their own devices" on public.trusted_devices
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read their audit events" on public.session_audit_logs
  for select using (auth.uid() = user_id);

-- 4. Helper function for recording session hygiene events
create or replace function public.record_session_event(p_event_type text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'record_session_event can only be called for authenticated users';
  end if;

  insert into public.session_audit_logs (user_id, event_type, metadata)
  values (auth.uid(), p_event_type, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

comment on function public.record_session_event is 'Utility to capture device trust and MFA session hygiene events.';
