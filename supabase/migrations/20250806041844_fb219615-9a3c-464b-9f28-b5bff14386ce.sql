-- Add policy to allow coaches to view client profiles for pending assignment requests
CREATE POLICY "Coaches can view client profiles for pending requests" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'client'::app_role AND 
  EXISTS (
    SELECT 1 
    FROM coach_assignment_requests car
    JOIN profiles coach_profile ON coach_profile.id = car.coach_id
    WHERE car.client_id = profiles.id 
    AND coach_profile.user_id = auth.uid()
    AND car.status = 'pending'
  )
);