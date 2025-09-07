import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, Calendar, Settings } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

export const SubscriptionStatus = () => {
  const { subscriptionStatus, isLoading, openCustomerPortal, checkSubscription } = useSubscription();

  if (!subscriptionStatus.subscribed) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold">Suscripción Activa</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {subscriptionStatus.subscription_tier || 'Premium'}
                </Badge>
              </div>
              {subscriptionStatus.subscription_end && (
                <div className="flex items-center text-sm text-muted-foreground mt-1">
                  <Calendar className="h-4 w-4 mr-1" />
                  Renovación: {formatDate(subscriptionStatus.subscription_end)}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkSubscription}
              disabled={isLoading}
            >
              {isLoading ? 'Verificando...' : 'Actualizar'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openCustomerPortal}
              disabled={isLoading}
            >
              <Settings className="h-4 w-4 mr-1" />
              Gestionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};