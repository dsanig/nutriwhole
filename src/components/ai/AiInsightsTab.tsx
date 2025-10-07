import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAiCoach } from "@/hooks/useAiCoach";
import { Profile } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import ClientSelector from "@/components/ClientSelector";
import AiUpgradePrompt from "@/components/ai/AiUpgradePrompt";

interface AiInsightsTabProps {
  profile: Profile;
}

const AiInsightsTab = ({ profile }: AiInsightsTabProps) => {
  const { openCustomerPortal } = useSubscription();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const subjectProfileId = profile.role === "coach" ? selectedClientId : profile.id;

  const {
    data,
    isLoading,
    isError,
    hasAccess,
    requiresMfa,
    subscriptionTier,
    requestRefresh,
    submitFeedback,
    escalateInsight
  } = useAiCoach(subjectProfileId ?? null);

  const insights = data?.insights ?? [];
  const lastGeneratedAt = data?.lastGeneratedAt ?? null;

  const defaultFeedback = useMemo(() => ({ rating: 5, comment: "" }), []);
  const [feedback, setFeedback] = useState(defaultFeedback);

  const handleFeedback = async (insightId: string) => {
    if (!feedback.rating) {
      toast({
        variant: "destructive",
        title: "Selecciona una calificación",
        description: "Ayúdanos a entender cómo sientes esta sugerencia."
      });
      return;
    }
    await submitFeedback({ insightId, rating: feedback.rating, comment: feedback.comment });
    setFeedback(defaultFeedback);
  };

  const handleEscalation = async (insightId: string) => {
    await escalateInsight({ insightId, reason: feedback.comment || undefined });
  };

  const handleRefresh = async () => {
    await requestRefresh();
  };

  const showUpgradePrompt = !hasAccess && profile.role === "client";
  const showMfaWarning = requiresMfa && (profile.role === "client" || profile.role === "coach");

  return (
    <div className="space-y-6">
      {profile.role === "coach" && (
        <ClientSelector profile={profile} selectedClientId={selectedClientId} onClientChange={setSelectedClientId} />
      )}

      {showMfaWarning && (
        <Card className="border-amber-500/60 bg-amber-50">
          <CardHeader className="flex flex-row gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <div>
              <CardTitle>Configura tu 2FA para usar Gemini</CardTitle>
              <CardDescription>
                Activa la autenticación multifactor para mantener protegidos los datos sensibles antes de consultar insights.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      {showUpgradePrompt && (
        <AiUpgradePrompt onManageSubscription={openCustomerPortal} subscriptionTier={subscriptionTier} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Gemini Insights</CardTitle>
            <CardDescription>
              Recomendaciones personalizadas basadas en tus métricas y hábitos recientes.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!subjectProfileId && (
            <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              Selecciona un cliente para revisar sus insights o asigna el coach inteligente desde Administración.
            </div>
          )}

          {isLoading && subjectProfileId && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {isError && subjectProfileId && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>No pudimos recuperar los insights. Intenta de nuevo en unos minutos.</span>
            </div>
          )}

          {!isLoading && !isError && subjectProfileId && hasAccess && !requiresMfa && (
            <Tabs defaultValue="insights" className="w-full">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="insights">Recomendaciones</TabsTrigger>
                <TabsTrigger value="history">Actividad</TabsTrigger>
              </TabsList>
              <TabsContent value="insights" className="space-y-4">
                {insights.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                    Aún no hay recomendaciones. Solicita una actualización o sincroniza nuevas métricas.
                  </div>
                ) : (
                  <ScrollArea className="h-[420px] pr-2">
                    <div className="space-y-4">
                      {insights.map((insight) => (
                        <Card key={insight.id} className="border-primary/10">
                          <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <CardTitle className="text-lg">{insight.headline}</CardTitle>
                                <CardDescription>
                                  {formatDistanceToNow(new Date(insight.created_at), { locale: es, addSuffix: true })}
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{insight.focus_area}</Badge>
                                {insight.requires_follow_up && <Badge variant="outline">Requiere seguimiento</Badge>}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {insight.narrative && <p className="text-sm leading-relaxed text-muted-foreground">{insight.narrative}</p>}
                            {insight.recommendations && insight.recommendations.length > 0 && (
                              <ul className="space-y-2">
                                {insight.recommendations.map((recommendation, index) => (
                                  <li key={index} className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                                    {typeof recommendation === "string"
                                      ? recommendation
                                      : recommendation.detail ?? recommendation.title ?? "Acción sugerida"}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {insight.escalations.length > 0 && (
                              <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
                                Seguimiento solicitado: {insight.escalations[0].status}
                              </div>
                            )}
                          </CardContent>
                          <CardFooter className="flex flex-col gap-3 border-t bg-muted/40">
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span>¿Útil? Califícalo y comparte contexto.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((rating) => (
                                  <Button
                                    key={rating}
                                    size="icon"
                                    variant={feedback.rating === rating ? "default" : "outline"}
                                    className="h-8 w-8"
                                    onClick={() => setFeedback((current) => ({ ...current, rating }))}
                                  >
                                    {rating}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <Textarea
                              value={feedback.comment}
                              onChange={(event) => setFeedback((current) => ({ ...current, comment: event.target.value }))}
                              placeholder="¿Qué te gustaría ajustar o aclarar?"
                              className="min-h-[80px]"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => handleFeedback(insight.id)}>
                                Enviar feedback
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleEscalation(insight.id)}>
                                Escalar al coach
                              </Button>
                            </div>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Registro de actividad</CardTitle>
                    <CardDescription>
                      Última generación: {lastGeneratedAt ? formatDistanceToNow(new Date(lastGeneratedAt), { locale: es, addSuffix: true }) : "Aún no disponible"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Cada lote de insights registra el contexto, métricas usadas y cualquier acción automática. Usa este espacio para documentar decisiones.
                    </p>
                    <Separator />
                    <Button variant="outline" className="w-fit" onClick={handleRefresh}>
                      Generar nuevo lote
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AiInsightsTab;
