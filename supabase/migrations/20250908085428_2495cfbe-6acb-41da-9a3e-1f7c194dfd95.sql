-- Add subscription_exempt field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN subscription_exempt BOOLEAN NOT NULL DEFAULT false;

-- Create index for better performance when querying exempt users
CREATE INDEX idx_profiles_subscription_exempt ON public.profiles(subscription_exempt) WHERE subscription_exempt = true;