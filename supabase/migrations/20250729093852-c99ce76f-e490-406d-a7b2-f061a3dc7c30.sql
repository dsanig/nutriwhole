-- First drop all policies that depend on has_role function
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.clients_coaches;
DROP POLICY IF EXISTS "Admins can manage all motivational notes" ON public.coach_motivational_notes;  
DROP POLICY IF EXISTS "Admins can manage all notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Admins can manage all meal plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Admins can manage all ingredients" ON public.plan_ingredients;
DROP POLICY IF EXISTS "Users can view ingredients from accessible meal plans" ON public.plan_ingredients;

-- Now we can safely drop the function
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Recreate the plan_ingredients policy without has_role reference
CREATE POLICY "Users can view ingredients from accessible meal plans" 
ON public.plan_ingredients 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM meal_plans mp
    JOIN profiles client_profile ON (client_profile.id = mp.client_id)
    JOIN profiles coach_profile ON (coach_profile.id = mp.coach_id)
    WHERE mp.id = plan_ingredients.meal_plan_id 
    AND (
      client_profile.user_id = auth.uid() 
      OR coach_profile.user_id = auth.uid()
    )
  )
);

-- Remove the coaches can view clients profiles policy that might cause issues
DROP POLICY IF EXISTS "Coaches can view their clients' profiles" ON public.profiles;