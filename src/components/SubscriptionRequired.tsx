import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, ExternalLink } from 'lucide-react';

interface SubscriptionRequiredProps {
  onRetryCheck: () => void;
  isChecking: boolean;
}

export const SubscriptionRequired = ({ onRetryCheck, isChecking }: SubscriptionRequiredProps) => {
  const handleVisitShop = () => {
    // TODO: Replace with your actual Odoo shop URL
    const shopUrl = 'https://your-odoo-shop.com'; // Change this to your Odoo shop URL
    window.open(shopUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <Crown className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Suscripción Requerida</CardTitle>
          <CardDescription className="text-base">
            Para acceder a NutriWhole, necesitas una suscripción activa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-2">¿Qué incluye tu suscripción?</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Planes nutricionales personalizados</li>
              <li>• Seguimiento con coaches profesionales</li>
              <li>• Notas motivacionales diarias</li>
              <li>• Registro de comidas y progreso</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={handleVisitShop} 
              className="w-full"
              size="lg"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Suscribirse Ahora
            </Button>
            
            <Button 
              onClick={onRetryCheck}
              variant="outline"
              className="w-full"
              disabled={isChecking}
            >
              {isChecking ? 'Verificando...' : 'Verificar Suscripción'}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            ¿Ya tienes una suscripción? Puede tardar unos minutos en activarse después del pago.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};