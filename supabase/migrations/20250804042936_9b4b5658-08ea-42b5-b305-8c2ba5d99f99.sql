-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Clients can view coach profiles for assignment requests" ON public.profiles;

-- Create a security definer function to check if current user is a client
CREATE OR REPLACE FUNCTION public.is_current_user_client()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'client'
  );
$$;

-- Create the correct policy using the security definer function
CREATE POLICY "Clients can view coach profiles for assignment requests" 
ON public.profiles 
FOR SELECT 
USING (
  role = 'coach' AND public.is_current_user_client()
);