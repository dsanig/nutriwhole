-- Add DELETE policy for coaches to unassign their clients
CREATE POLICY "Coaches can delete their assignments" 
ON public.clients_coaches 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.id = clients_coaches.coach_id 
    AND p.user_id = auth.uid()
  )
);