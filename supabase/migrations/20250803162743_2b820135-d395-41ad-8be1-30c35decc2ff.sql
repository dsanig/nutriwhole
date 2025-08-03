-- Create table for coach assignment requests
CREATE TABLE public.coach_assignment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, coach_id, status) -- Prevent duplicate pending requests
);

-- Enable Row Level Security
ALTER TABLE public.coach_assignment_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for assignment requests
CREATE POLICY "Clients can create requests for themselves" 
ON public.coach_assignment_requests 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = client_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can view their own requests" 
ON public.coach_assignment_requests 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = client_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can view requests for themselves" 
ON public.coach_assignment_requests 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = coach_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can update requests for themselves" 
ON public.coach_assignment_requests 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = coach_id AND p.user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_coach_assignment_requests_updated_at
BEFORE UPDATE ON public.coach_assignment_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();