-- Tighten coach-managed policies to require coach role and explicit WITH CHECK clauses

-- Meal plan management policy
DROP POLICY IF EXISTS "Coaches can manage their clients' meal plans" ON public.meal_plans;
CREATE POLICY "Coaches can manage their clients' meal plans" ON public.meal_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = coach_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = coach_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  );

-- Plan ingredient management policy
DROP POLICY IF EXISTS "Coaches can manage ingredients for their clients" ON public.plan_ingredients;
CREATE POLICY "Coaches can manage ingredients for their clients" ON public.plan_ingredients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      JOIN public.profiles p ON p.id = mp.coach_id
      WHERE mp.id = meal_plan_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      JOIN public.profiles p ON p.id = mp.coach_id
      WHERE mp.id = meal_plan_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  );

-- Coach motivational notes policy
DROP POLICY IF EXISTS "Coaches can manage notes for their clients" ON public.coach_motivational_notes;
CREATE POLICY "Coaches can manage notes for their clients" ON public.coach_motivational_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = coach_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = coach_id
        AND p.user_id = auth.uid()
        AND p.role = 'coach'
    )
  );
