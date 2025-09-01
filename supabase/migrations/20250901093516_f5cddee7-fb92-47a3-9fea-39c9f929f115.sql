-- Allow coaches to create assignments for themselves
CREATE POLICY "Coaches can create their assignments"
ON public.clients_coaches
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = clients_coaches.coach_id
      AND p.user_id = auth.uid()
  )
);