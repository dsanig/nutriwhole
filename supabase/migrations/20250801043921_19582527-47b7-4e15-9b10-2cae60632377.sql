-- Add foreign key constraints to clients_coaches table
ALTER TABLE public.clients_coaches 
ADD CONSTRAINT clients_coaches_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clients_coaches 
ADD CONSTRAINT clients_coaches_coach_id_fkey 
FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;