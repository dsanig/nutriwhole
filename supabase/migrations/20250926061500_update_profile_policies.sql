-- Ensure the previous self-update policy is removed so we can recreate it
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Helper function to make sure self-service updates cannot escalate privileges
CREATE OR REPLACE FUNCTION public.can_self_update_profile(
  _id uuid,
  _role public.app_role,
  _subscription_exempt boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_role public.app_role;
  _current_subscription_exempt boolean;
BEGIN
  SELECT role, subscription_exempt
    INTO _current_role, _current_subscription_exempt
  FROM public.profiles
  WHERE id = _id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN _current_role = _role
    AND _current_subscription_exempt IS NOT DISTINCT FROM _subscription_exempt;
END;
$$;

-- Allow users to update their own profile but only if they keep privileged fields unchanged
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND public.can_self_update_profile(id, role, subscription_exempt)
);

-- Helper to determine if a user is an admin without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role = 'admin'::public.app_role
  );
$$;

-- Admins can update any profile, including privileged fields
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profile privileges" ON public.profiles;

CREATE POLICY "Admins can update profile privileges"
ON public.profiles
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
