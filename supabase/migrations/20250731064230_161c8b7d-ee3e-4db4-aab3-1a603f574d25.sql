-- First, drop the problematic policies that could cause infinite recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.clients_coaches;

-- Create a security definer function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Create safe RLS policies using the security definer function
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (public.get_current_user_role() = 'admin');

CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (public.get_current_user_role() = 'admin');

-- Add policy for admins to manage client-coach assignments
CREATE POLICY "Admins can manage all assignments" 
ON public.clients_coaches 
FOR ALL 
USING (public.get_current_user_role() = 'admin');