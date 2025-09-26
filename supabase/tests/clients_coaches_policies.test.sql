BEGIN;

-- Seed users and profiles required for assignment scenarios
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'coach1@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach One","role":"coach"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'coach2@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach Two","role":"coach"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'coach3@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach Three","role":"coach"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'client1@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client One","role":"client"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'client2@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client Two","role":"client"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'client3@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client Three","role":"client"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'admin1@example.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin One","role":"admin"}', NOW(), NOW(), '', '', '', '');

INSERT INTO public.profiles (id, user_id, email, full_name, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'coach1@example.com', 'Coach One', 'coach'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', 'coach2@example.com', 'Coach Two', 'coach'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', '33333333-3333-3333-3333-333333333333', 'coach3@example.com', 'Coach Three', 'coach'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '44444444-4444-4444-4444-444444444444', 'client1@example.com', 'Client One', 'client'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', '55555555-5555-5555-5555-555555555555', 'client2@example.com', 'Client Two', 'client'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff6', '66666666-6666-6666-6666-666666666666', 'client3@example.com', 'Client Three', 'client'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'admin1@example.com', 'Admin One', 'admin');

INSERT INTO public.coach_assignment_requests (client_id, coach_id, status, message)
VALUES
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'accepted', 'Accepted assignment'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'pending', 'Pending assignment request');

SELECT plan(4);

SELECT throws_like(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.clients_coaches (client_id, coach_id)
    VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  '42501',
  'coaches without accepted request cannot assign clients'
);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.clients_coaches (client_id, coach_id)
    VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
    ON CONFLICT (client_id, coach_id) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  'accepted coaches can assign their clients'
);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.clients_coaches (client_id, coach_id)
    VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2')
    ON CONFLICT (client_id, coach_id) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  'admins can assign clients regardless of requests'
);

SELECT lives_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);

    INSERT INTO public.clients_coaches (client_id, coach_id, assigned_at)
    VALUES ('ffffffff-ffff-ffff-ffff-fffffffffff6', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', NOW())
    ON CONFLICT (client_id, coach_id) DO UPDATE SET assigned_at = EXCLUDED.assigned_at;

    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  'service role can upsert client assignments'
);

SELECT finish();

ROLLBACK;
