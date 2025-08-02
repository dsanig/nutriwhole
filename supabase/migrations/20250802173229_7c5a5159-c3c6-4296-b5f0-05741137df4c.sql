-- Drop ALL existing policies that might cause conflicts
DROP POLICY IF EXISTS "Coaches can view their assigned clients profiles" ON public.profiles;