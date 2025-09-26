-- Replace handle_new_user to ignore client-provided roles and enforce safe defaults
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  requested_role TEXT;
  sanitized_role TEXT;
BEGIN
  -- Always default to client unless server-side rules elevate later.
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', '');
  sanitized_role := lower(trim(requested_role));

  IF sanitized_role = 'admin' THEN
    RAISE WARNING 'Ignoring attempt to assign admin role via sign-up metadata for user %', NEW.id;
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'client'::public.app_role
  );

  RETURN NEW;
END;
$function$;

-- Recreate trigger using new function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Secure helper to change roles after server-side validation
CREATE OR REPLACE FUNCTION public.set_profile_role(
  target_profile_id UUID,
  new_role public.app_role
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, auth'
AS $function$
DECLARE
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING MESSAGE = 'Only admins can change roles';
  END IF;

  IF new_role IS NULL THEN
    RAISE EXCEPTION 'invalid_parameter_value' USING MESSAGE = 'Role must be provided';
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_profile_id
  RETURNING * INTO updated_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_data_found' USING MESSAGE = 'Profile not found';
  END IF;

  RETURN updated_profile;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_profile_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_role(UUID, public.app_role) TO service_role;
