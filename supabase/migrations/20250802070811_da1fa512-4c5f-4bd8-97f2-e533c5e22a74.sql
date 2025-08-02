-- Allow coaches to view their assigned clients' profiles
CREATE POLICY "Coaches can view their assigned clients profiles" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'client' AND 
  EXISTS (
    SELECT 1 
    FROM clients_coaches cc
    JOIN profiles coach_profile ON coach_profile.id = cc.coach_id
    WHERE cc.client_id = profiles.id 
    AND coach_profile.user_id = auth.uid()
  )
);