-- Drop the problematic policy
DROP POLICY IF EXISTS "Coaches can view their assigned clients profiles" ON public.profiles;

-- Create a fixed policy that avoids recursion by using user_id directly
CREATE POLICY "Coaches can view their assigned clients profiles" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'client' AND 
  EXISTS (
    SELECT 1 
    FROM clients_coaches cc
    WHERE cc.client_id = profiles.id 
    AND cc.coach_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid() AND role = 'coach'
    )
  )
);