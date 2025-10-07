import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'coach' | 'client';
  subscription_exempt: boolean; // Allows access without active subscription
  premium_locked?: boolean;
  premium_locked_reason?: string | null;
  mfa_required?: boolean;
  mfa_enrolled?: boolean;
  mfa_verified_at?: string | null;
}

export interface SignInResult {
  error?: Error;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
        return;
      }

      setProfile(profileData);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      loadProfile(nextSession.user.id);
    },
    [loadProfile]
  );

  useEffect(() => {
    let isMounted = true;
    const subscriptions: Array<() => void> = [];

    const subscribeToAuthChanges = () => {
      try {
        const { data } = supabase.auth.onAuthStateChange((_, session) => {
          if (!isMounted) {
            return;
          }
          applySession(session);
        });
        if (data?.subscription) {
          subscriptions.push(() => data.subscription.unsubscribe());
        }
      } catch (error) {
        console.error('Error subscribing to auth changes:', error);
        setLoading(false);
      }
    };

    const fetchExistingSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) {
          return;
        }
        applySession(data.session ?? null);
      } catch (error) {
        console.error('Error getting existing session:', error);
        if (!isMounted) {
          return;
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    };

    subscribeToAuthChanges();
    fetchExistingSession();

    return () => {
      isMounted = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [applySession]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });

    return { error };
  };

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return {};
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    await loadProfile(user.id);
  }, [loadProfile, user]);

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile
  };
};
