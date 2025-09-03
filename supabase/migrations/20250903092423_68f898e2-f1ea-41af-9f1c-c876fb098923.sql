-- 1) Create helper functions to avoid recursion in profiles SELECT policies
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_coach_view_client_profile_pending(_client_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_assignment_requests car
    WHERE car.client_id = _client_profile_id
      AND car.coach_id = public.get_current_profile_id()
      AND car.status = 'pending'
  );
$$;

-- 2) Replace recursive policy for pending requests with function-based policy
DROP POLICY IF EXISTS "Coaches can view client profiles for pending requests" ON public.profiles;
CREATE POLICY "Coaches can view client profiles for pending requests"
ON public.profiles
FOR SELECT
USING (
  role = 'client'::public.app_role AND public.can_coach_view_client_profile_pending(id)
);

-- 3) Ensure profiles are created for new users via auth trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) Backfill profiles for existing auth users missing a profile
INSERT INTO public.profiles (user_id, email, full_name, role)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       COALESCE((u.raw_user_meta_data->>'role')::public.app_role, 'client'::public.app_role)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;