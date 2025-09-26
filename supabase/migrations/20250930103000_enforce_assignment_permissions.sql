-- Ensure coaches can only assign clients when authorized
CREATE OR REPLACE FUNCTION public.can_assign_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.jwt()->>'role' = 'service_role')
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.coach_assignment_requests car
      JOIN public.profiles coach_profile
        ON coach_profile.id = car.coach_id
      WHERE car.client_id = _client_id
        AND car.status = 'accepted'
        AND coach_profile.user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Coaches can create their assignments" ON public.clients_coaches;

CREATE POLICY "Coaches can create their assignments"
ON public.clients_coaches
FOR INSERT
WITH CHECK (
  public.can_assign_client(clients_coaches.client_id)
);
