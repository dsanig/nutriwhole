-- Create a security definer function to check if current user can view a client profile
CREATE OR REPLACE FUNCTION public.can_coach_view_client_profile(_client_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.clients_coaches cc
    JOIN public.profiles coach_profile ON coach_profile.id = cc.coach_id
    WHERE cc.client_id = _client_profile_id 
    AND coach_profile.user_id = auth.uid()
  );
$$;

-- Create the policy using the security definer function
CREATE POLICY "Coaches can view their assigned clients profiles" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'client' AND public.can_coach_view_client_profile(id)
);