-- Add foreign key constraints to coach_assignment_requests table only
ALTER TABLE public.coach_assignment_requests 
ADD CONSTRAINT coach_assignment_requests_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.coach_assignment_requests 
ADD CONSTRAINT coach_assignment_requests_coach_id_fkey 
FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;