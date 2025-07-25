-- First, let's check what helper function exists
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%role%';

-- Create the has_role function if it doesn't exist
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid, expected_role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE profiles.user_id = has_role.user_id 
    AND profiles.role = expected_role
  );
END;
$$;

-- Now let's recreate the policies without recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

-- Create admin policies that check the role directly from the profiles table
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'::app_role
  )
  OR auth.uid() = user_id
);

CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'::app_role
  )
  OR auth.uid() = user_id
);

CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE role = 'admin'::app_role
  )
  OR auth.uid() = user_id
);