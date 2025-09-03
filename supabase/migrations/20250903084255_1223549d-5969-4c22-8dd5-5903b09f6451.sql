-- Allow coaches to view client profiles for pending assignment requests
CREATE POLICY "Coaches can view client profiles for pending requests" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (
  role = 'client' AND EXISTS (
    SELECT 1 
    FROM coach_assignment_requests car
    JOIN profiles coach_profile ON coach_profile.user_id = auth.uid()
    WHERE car.client_id = profiles.id 
    AND car.coach_id = coach_profile.id 
    AND car.status = 'pending'
  )
);