-- Add DELETE policy for clients to delete their own requests
CREATE POLICY "Clients can delete their own requests" 
ON public.coach_assignment_requests 
FOR DELETE 
USING (EXISTS ( 
  SELECT 1 
  FROM profiles p 
  WHERE p.id = coach_assignment_requests.client_id AND p.user_id = auth.uid()
));