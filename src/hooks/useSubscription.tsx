import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionStatus {
  subscribed: boolean;
  subscription_tier?: string | null;
  subscription_end?: string | null;
}

export const useSubscription = () => {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({ subscribed: false });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const checkSubscription = async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setSubscriptionStatus({ subscribed: false });
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        toast({
          title: 'Error',
          description: 'Failed to check subscription status',
          variant: 'destructive',
        });
        return;
      }

      setSubscriptionStatus(data);
    } catch (error) {
      console.error('Error checking subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to check subscription status',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: 'Error',
          description: 'Please log in to manage your subscription',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error opening customer portal:', error);
        toast({
          title: 'Error',
          description: 'Failed to open subscription management',
          variant: 'destructive',
        });
        return;
      }

      // Open customer portal in new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: 'Error',
        description: 'Failed to open subscription management',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check subscription on mount
  useEffect(() => {
    checkSubscription();
  }, []);

  // Set up periodic checking (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(checkSubscription, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    subscriptionStatus,
    isLoading,
    checkSubscription,
    openCustomerPortal,
  };
};