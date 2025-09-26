BEGIN;

SELECT plan(5);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    PERFORM set_config('request.jwt.claim.email', 'member@example.com', true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);

    INSERT INTO public.subscribers (user_id, email, subscribed)
    VALUES ('11111111-1111-1111-1111-111111111111', 'member@example.com', true)
    ON CONFLICT (email) DO UPDATE SET subscribed = EXCLUDED.subscribed;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  'service role can upsert subscriptions'
);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    PERFORM set_config('request.jwt.claim.email', 'owner@example.com', true);

    INSERT INTO public.subscribers (user_id, email, subscribed)
    VALUES ('22222222-2222-2222-2222-222222222222', 'owner@example.com', false);

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
  END;
  $do$;
  $$,
  'members can insert their own subscription row'
);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    PERFORM set_config('request.jwt.claim.email', 'owner@example.com', true);

    UPDATE public.subscribers
      SET subscribed = true
    WHERE user_id = '22222222-2222-2222-2222-222222222222';

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
  END;
  $do$;
  $$,
  'members can update their own subscription row'
);

SELECT throws_like(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    PERFORM set_config('request.jwt.claim.email', 'intruder@example.com', true);

    UPDATE public.subscribers
      SET subscribed = false
    WHERE user_id = '22222222-2222-2222-2222-222222222222';

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
  END;
  $do$;
  $$,
  '42501',
  'unrelated users cannot modify someone else''s subscription'
);

SELECT throws_like(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    PERFORM set_config('request.jwt.claim.email', 'spoofed@example.com', true);

    UPDATE public.subscribers
      SET subscribed = false
    WHERE user_id = '22222222-2222-2222-2222-222222222222';

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.email', '', true);
  END;
  $do$;
  $$,
  '42501',
  'mismatched email claims are rejected during updates'
);

SELECT finish();

ROLLBACK;
