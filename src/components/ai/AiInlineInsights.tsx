import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { AiInsight } from "@/hooks/useAiCoach";

interface AiInlineInsightsProps {
  insights: AiInsight[];
  onOpenTab?: () => void;
}

const AiInlineInsights = ({ insights, onOpenTab }: AiInlineInsightsProps) => {
  if (!insights.length) {
    return null;
  }

  const topInsight = insights[0];
  const secondary = insights.slice(1, 3);

  const riskTone = topInsight.risk_level === "alto" ? "destructive" : topInsight.risk_level === "moderado" ? "default" : "secondary";

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="text-base">Gemini destaca</CardTitle>
            <CardDescription>
              Actualizado {formatDistanceToNow(new Date(topInsight.created_at), { locale: es, addSuffix: true })}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={riskTone}>{topInsight.focus_area}</Badge>
          {topInsight.confidence != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confianza {Math.round(topInsight.confidence * 100)}%</span>
              <Progress value={Math.round(topInsight.confidence * 100)} className="w-20" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{topInsight.narrative ?? topInsight.headline}</p>
        {topInsight.recommendations?.slice(0, 2).map((recommendation, index) => (
          <div key={index} className="rounded-lg bg-muted px-3 py-2 text-sm">
            {typeof recommendation === "string" ? recommendation : recommendation.detail ?? recommendation.title}
          </div>
        ))}
        {secondary.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {secondary.map((insight) => (
              <div key={insight.id} className="rounded-lg border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {insight.focus_area}
                  </span>
                  {insight.requires_follow_up && <Badge variant="outline">Seguimiento</Badge>}
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">{insight.headline}</p>
              </div>
            ))}
          </div>
        )}
        {onOpenTab && (
          <Button variant="ghost" size="sm" className="gap-2" onClick={onOpenTab}>
            Ver todas las ideas
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default AiInlineInsights;
