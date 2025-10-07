-- Strengthen MFA enforcement, hashed backup codes, and premium lock alignment
begin;

create extension if not exists pgcrypto with schema public;

alter table public.mfa_backup_codes
  add column if not exists code_hash text,
  add column if not exists code_hint text;

update public.mfa_backup_codes
set code_hash = coalesce(code_hash, encode(digest(code, 'sha256'), 'hex')),
    code_hint = coalesce(code_hint, right(code, 4))
where code_hash is null;

alter table public.mfa_backup_codes
  alter column code_hash set not null;

alter table public.mfa_backup_codes
  drop column if exists code;

alter table public.mfa_factors enable row level security;

drop policy if exists "Users read their own factors" on public.mfa_factors;
drop policy if exists "Users write their own factors" on public.mfa_factors;
drop policy if exists "Users update their own factors" on public.mfa_factors;

drop policy if exists "Users manage their own backup codes" on public.mfa_backup_codes;
drop policy if exists "Users insert their own backup codes" on public.mfa_backup_codes;
drop policy if exists "Users update their own backup codes" on public.mfa_backup_codes;

create policy "Service role only" on public.mfa_factors
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role only" on public.mfa_backup_codes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view public.mfa_factor_summaries as
  select id, user_id, factor_type, friendly_name, confirmed_at, created_at, updated_at
  from public.mfa_factors;

grant select on public.mfa_factor_summaries to authenticated, service_role, anon;

create or replace view public.mfa_backup_code_status as
  select id, user_id, consumed, consumed_at, code_hint, created_at
  from public.mfa_backup_codes;

grant select on public.mfa_backup_code_status to authenticated, service_role, anon;

create policy "Read own summaries" on public.mfa_factor_summaries
  for select using (auth.uid() = user_id);

create policy "Read own backup status" on public.mfa_backup_code_status
  for select using (auth.uid() = user_id);

create table if not exists public.mfa_override_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issued_by uuid not null references auth.users (id) on delete set null,
  token_hash text not null,
  reason text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mfa_override_tokens enable row level security;

drop policy if exists "override service role" on public.mfa_override_tokens;

create policy "Service managed overrides" on public.mfa_override_tokens
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.profiles
  add column if not exists premium_locked boolean not null default false,
  add column if not exists premium_locked_reason text;

commit;
