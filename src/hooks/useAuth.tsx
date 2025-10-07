import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { fingerprintDevice } from '@/lib/security';

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

export interface SignInOptions {
  code?: string;
  backupCode?: string;
  rememberDevice?: boolean;
  deviceName?: string;
  overrideToken?: string;
  passkeyAssertion?: unknown;
}

export interface SignInResult {
  error?: Error;
  requiresMfa?: boolean;
  backupCodes?: string[];
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
    );

    // Check for existing session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const fetchProfile = async () => {
            try {
              const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();

              if (error) {
                console.error('Error fetching profile:', error);
              }

              setProfile(profile);
              setLoading(false);
            } catch (error) {
              console.error('Error fetching profile:', error);
              setProfile(null);
              setLoading(false);
            }
          };

          fetchProfile();
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error getting existing session:', error);
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) {
          return;
        }
        applySession(session);
      })
      .catch((error) => {
        console.error('Error getting existing session:', error);
        if (!isMounted) {
          return;
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
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

  const signIn = async (email: string, password: string, options: SignInOptions = {}): Promise<SignInResult> => {
    const deviceFingerprint = fingerprintDevice();
    const { data, error } = await supabase.functions.invoke("mfa-verify-login", {
      body: {
        email,
        password,
        code: options.code,
        backupCode: options.backupCode,
        deviceFingerprint,
        deviceName: options.deviceName,
        rememberDevice: options.rememberDevice,
        overrideToken: options.overrideToken,
        passkeyAssertion: options.passkeyAssertion
      }
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    if (data?.requiresMfa) {
      return { requiresMfa: true };
    }

    if (data?.session) {
      const { error: setError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (setError) {
        return { error: new Error(setError.message) };
      }
    }

    return { backupCodes: data?.backupCodes };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const requestPasskeyChallenge = async (email: string) => {
    const { data, error } = await supabase.functions.invoke("mfa-passkey-challenge", {
      body: { email }
    });
    if (error) {
      return { error: new Error(error.message) };
    }
    return { options: (data as { options?: Record<string, unknown> })?.options ?? null };
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    requestPasskeyChallenge
  };
};
