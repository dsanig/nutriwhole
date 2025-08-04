-- Add foreign key constraints to coach_assignment_requests table
ALTER TABLE public.coach_assignment_requests 
ADD CONSTRAINT coach_assignment_requests_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.coach_assignment_requests 
ADD CONSTRAINT coach_assignment_requests_coach_id_fkey 
FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add foreign key constraints to clients_coaches table if they don't exist
ALTER TABLE public.clients_coaches 
ADD CONSTRAINT clients_coaches_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clients_coaches 
ADD CONSTRAINT clients_coaches_coach_id_fkey 
FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;