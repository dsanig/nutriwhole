-- Remove ALL policies that cause recursion by querying profiles table from within profiles policies
-- This includes the admin policies that still cause recursion

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;  
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Keep only the safe, non-recursive policies
-- These are the ones that don't query the profiles table from within the profiles table policy

-- Basic user policies (already exist and work fine)
-- "Users can view own profile" - works because it uses auth.uid() = user_id
-- "Users can update own profile" - works because it uses auth.uid() = user_id  
-- "Allow profile creation" - works because it uses auth.uid() = user_id

-- Note: Admin functionality will need to be handled at the application level
-- or through a different approach that doesn't cause RLS recursion