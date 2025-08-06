-- Drop the problematic policy that's causing infinite recursion
DROP POLICY IF EXISTS "Coaches can view client profiles for pending requests" ON public.profiles;

-- Create a simpler policy that doesn't cause recursion
CREATE POLICY "Coaches can view client profiles for pending requests" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'client'::app_role AND 
  EXISTS (
    SELECT 1 
    FROM coach_assignment_requests 
    WHERE client_id = profiles.id 
    AND coach_id IN (
      SELECT id FROM profiles 
      WHERE user_id = auth.uid() AND role = 'coach'::app_role
    )
    AND status = 'pending'
  )
);