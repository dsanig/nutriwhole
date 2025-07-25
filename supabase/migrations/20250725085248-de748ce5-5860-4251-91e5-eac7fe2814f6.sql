-- Drop and recreate the problematic admin policies to avoid recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

-- Create a security definer function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT role 
  FROM public.profiles 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Create admin policies using the security definer function
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.get_current_user_role() = 'admin'::app_role OR auth.uid() = user_id);

CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (public.get_current_user_role() = 'admin'::app_role OR auth.uid() = user_id);

CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (public.get_current_user_role() = 'admin'::app_role OR auth.uid() = user_id);

-- Also need to create the trigger to auto-create profiles
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();