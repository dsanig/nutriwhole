-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'client');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'client',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create clients_coaches mapping table
CREATE TABLE public.clients_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, coach_id)
);

-- Create meal_plans table
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  meal_type TEXT NOT NULL, -- 'desayuno', 'almuerzo', 'comida', 'merienda', 'snack', 'cena'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create plan_ingredients table
CREATE TABLE public.plan_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID REFERENCES public.meal_plans(id) ON DELETE CASCADE NOT NULL,
  ingredient_name TEXT NOT NULL,
  grams DECIMAL(8,2) NOT NULL,
  carbs DECIMAL(8,2) DEFAULT 0,
  proteins DECIMAL(8,2) DEFAULT 0,
  fats DECIMAL(8,2) DEFAULT 0,
  calories DECIMAL(8,2) DEFAULT 0,
  fiber DECIMAL(8,2) DEFAULT 0,
  cholesterol DECIMAL(8,2) DEFAULT 0,
  sodium DECIMAL(8,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create daily_notes table (client notes)
CREATE TABLE public.daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  meal_plan_id UUID REFERENCES public.meal_plans(id) ON DELETE CASCADE NOT NULL,
  note_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create coach_motivational_notes table
CREATE TABLE public.coach_motivational_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  note_date DATE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(coach_id, client_id, note_date)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_motivational_notes ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user profile
CREATE OR REPLACE FUNCTION public.get_user_profile(_user_id UUID)
RETURNS TABLE(id UUID, user_id UUID, email TEXT, full_name TEXT, role app_role)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT p.id, p.user_id, p.email, p.full_name, p.role
  FROM public.profiles p
  WHERE p.user_id = _user_id
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view their clients' profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients_coaches cc
      JOIN public.profiles coach_profile ON coach_profile.id = cc.coach_id
      WHERE cc.client_id = profiles.id
        AND coach_profile.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for clients_coaches
CREATE POLICY "Coaches can view their assignments" ON public.clients_coaches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = coach_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view their coach assignments" ON public.clients_coaches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = client_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all assignments" ON public.clients_coaches
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for meal_plans
CREATE POLICY "Clients can view their own meal plans" ON public.meal_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = client_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view their clients' meal plans" ON public.meal_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = coach_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage their clients' meal plans" ON public.meal_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = coach_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all meal plans" ON public.meal_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for plan_ingredients
CREATE POLICY "Users can view ingredients from accessible meal plans" ON public.plan_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      JOIN public.profiles client_profile ON client_profile.id = mp.client_id
      JOIN public.profiles coach_profile ON coach_profile.id = mp.coach_id
      WHERE mp.id = meal_plan_id
        AND (
          client_profile.user_id = auth.uid() -- Client can see their own
          OR coach_profile.user_id = auth.uid() -- Coach can see their clients'
          OR public.has_role(auth.uid(), 'admin') -- Admin can see all
        )
    )
  );

CREATE POLICY "Coaches can manage ingredients for their clients" ON public.plan_ingredients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      JOIN public.profiles p ON p.id = mp.coach_id
      WHERE mp.id = meal_plan_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all ingredients" ON public.plan_ingredients
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for daily_notes
CREATE POLICY "Clients can manage their own notes" ON public.daily_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = client_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view their clients' notes" ON public.daily_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      JOIN public.profiles coach_profile ON coach_profile.id = mp.coach_id
      WHERE mp.id = meal_plan_id AND coach_profile.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all notes" ON public.daily_notes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for coach_motivational_notes
CREATE POLICY "Coaches can manage notes for their clients" ON public.coach_motivational_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = coach_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view their coach's notes" ON public.coach_motivational_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = client_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all motivational notes" ON public.coach_motivational_notes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'client')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_notes_updated_at
  BEFORE UPDATE ON public.daily_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coach_motivational_notes_updated_at
  BEFORE UPDATE ON public.coach_motivational_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default admin user (will be created when admin signs up with admin@admin.com)
-- This will be handled by the application signup flow