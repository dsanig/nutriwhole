import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AiUpgradePromptProps {
  onManageSubscription?: () => void;
  subscriptionTier?: string | null | undefined;
}

const tierCopy: Record<string, string> = {
  core: "Desbloquea el coach inteligente para recibir ajustes basados en tus métricas.",
  plus: "Tu plan actual no incluye el coach Gemini. Mejora para obtener recomendaciones proactivas.",
  premium: "Confirma tu 2FA para comenzar a recibir insights inteligentes.",
  enterprise: "Contacta a soporte para activar el módulo de Gemini en tu organización."
};

const AiUpgradePrompt = ({ onManageSubscription, subscriptionTier }: AiUpgradePromptProps) => {
  const tier = subscriptionTier ?? "core";
  const description = tierCopy[tier] ?? tierCopy.core;

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center gap-3">
        <Sparkles className="w-5 h-5 text-primary" />
        <div>
          <CardTitle>Activa el coach inteligente</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button onClick={onManageSubscription} disabled={!onManageSubscription}>
          Gestionar suscripción
        </Button>
      </CardContent>
    </Card>
  );
};

export default AiUpgradePrompt;
