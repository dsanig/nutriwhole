BEGIN;

SELECT plan(5);

-- 1. Seed a coach and client with service role rights
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    coach_user_id CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_user_id CONSTANT uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claim.sub', coach_user_id::text, true);

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = coach_user_id) THEN
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
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        coach_user_id,
        'authenticated',
        'authenticated',
        'coach@example.com',
        crypt('password', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Coach Example","role":"coach"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = client_user_id) THEN
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
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        client_user_id,
        'authenticated',
        'authenticated',
        'client@example.com',
        crypt('password', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Client Example","role":"client"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = coach_user_id) THEN
      INSERT INTO public.profiles (user_id, email, full_name, role)
      VALUES (coach_user_id, 'coach@example.com', 'Coach Example', 'coach');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = client_user_id) THEN
      INSERT INTO public.profiles (user_id, email, full_name, role)
      VALUES (client_user_id, 'client@example.com', 'Client Example', 'client');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.clients_coaches cc
      JOIN public.profiles coach_profile ON coach_profile.id = cc.coach_id
      JOIN public.profiles client_profile ON client_profile.id = cc.client_id
      WHERE coach_profile.user_id = coach_user_id
        AND client_profile.user_id = client_user_id
    ) THEN
      INSERT INTO public.clients_coaches (client_id, coach_id)
      SELECT client_profile.id, coach_profile.id
      FROM public.profiles client_profile, public.profiles coach_profile
      WHERE client_profile.user_id = client_user_id
        AND coach_profile.user_id = coach_user_id
      LIMIT 1;
    END IF;

    PERFORM set_config('request.jwt.claim.role', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END;
  $do$;
  $$,
  'service role can seed coach/client fixtures'
);

-- 2. Coaches can still create meal plans for their clients
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    coach_user_id CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_user_id CONSTANT uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    coach_profile_id uuid;
    client_profile_id uuid;
  BEGIN
    SELECT id INTO coach_profile_id FROM public.profiles WHERE user_id = coach_user_id;
    SELECT id INTO client_profile_id FROM public.profiles WHERE user_id = client_user_id;

    PERFORM set_config('request.jwt.claim.sub', coach_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.meal_plans (client_id, coach_id, plan_date, meal_type)
    VALUES (client_profile_id, coach_profile_id, '2025-01-01', 'desayuno')
    ON CONFLICT DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  'coach can insert meal plans for assigned clients'
);

-- 3. Clients cannot insert new meal plans even if they know the coach profile
SELECT throws_like(
  $$
  DO $do$
  DECLARE
    coach_user_id CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_user_id CONSTANT uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    coach_profile_id uuid;
    client_profile_id uuid;
  BEGIN
    SELECT id INTO coach_profile_id FROM public.profiles WHERE user_id = coach_user_id;
    SELECT id INTO client_profile_id FROM public.profiles WHERE user_id = client_user_id;

    PERFORM set_config('request.jwt.claim.sub', client_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.meal_plans (client_id, coach_id, plan_date, meal_type)
    VALUES (client_profile_id, coach_profile_id, '2025-01-02', 'almuerzo');

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  '42501',
  'client JWTs cannot insert meal plans'
);

-- 4. Clients cannot insert ingredients into an existing meal plan
SELECT throws_like(
  $$
  DO $do$
  DECLARE
    client_user_id CONSTANT uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    target_meal_plan_id uuid;
  BEGIN
    SELECT id INTO target_meal_plan_id
    FROM public.meal_plans
    ORDER BY created_at DESC
    LIMIT 1;

    IF target_meal_plan_id IS NULL THEN
      RAISE EXCEPTION 'expected meal plan to exist for ingredient test';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', client_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.plan_ingredients (
      meal_plan_id,
      ingredient_name,
      grams,
      carbs,
      proteins,
      fats,
      calories
    ) VALUES (
      target_meal_plan_id,
      'Arroz integral',
      100,
      70,
      8,
      2,
      350
    );

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  '42501',
  'client JWTs cannot insert plan ingredients'
);

-- 5. Clients cannot insert motivational notes intended for coaches
SELECT throws_like(
  $$
  DO $do$
  DECLARE
    coach_user_id CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_user_id CONSTANT uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    coach_profile_id uuid;
    client_profile_id uuid;
  BEGIN
    SELECT id INTO coach_profile_id FROM public.profiles WHERE user_id = coach_user_id;
    SELECT id INTO client_profile_id FROM public.profiles WHERE user_id = client_user_id;

    PERFORM set_config('request.jwt.claim.sub', client_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.coach_motivational_notes (coach_id, client_id, note_date, message)
    VALUES (coach_profile_id, client_profile_id, '2025-01-03', '¡Hoy voy a motivarme solo!');

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
  END;
  $do$;
  $$,
  '42501',
  'client JWTs cannot insert coach motivational notes'
);

SELECT finish();

ROLLBACK;
