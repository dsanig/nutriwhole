-- Add policy to allow clients to view coach profiles for assignment requests
CREATE POLICY "Clients can view coach profiles for assignment requests" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'coach' AND 
  EXISTS (
    SELECT 1 FROM public.profiles client_profile 
    WHERE client_profile.user_id = auth.uid() 
    AND client_profile.role = 'client'
  )
);