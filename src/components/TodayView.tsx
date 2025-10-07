import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useAiCoach } from '@/hooks/useAiCoach';
import { useLifestyle } from '@/hooks/useLifestyle';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClientSelector from '@/components/ClientSelector';
import AiInlineInsights from '@/components/ai/AiInlineInsights';

interface MealPlan {
  id: string;
  meal_type: string;
  ingredients: Array<{
    ingredient_name: string;
    grams: number;
    carbs: number;
    proteins: number;
    fats: number;
    calories: number;
  }>;
  note?: string;
}

interface MotivationalNote {
  message: string;
}

interface TodayViewProps {
  profile: Profile;
  onOpenAiTab?: () => void;
}

const TodayView = ({ profile, onOpenAiTab }: TodayViewProps) => {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [motivationalNote, setMotivationalNote] = useState<MotivationalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { toast } = useToast();
  const telemetrySubjectId = profile.role === 'coach' ? selectedClientId : profile.id;
  const {
    milestones: telemetryMilestones,
    sentiments: telemetrySentiments,
    loading: telemetryLoading,
  } = useTelemetry(telemetrySubjectId, {
    timeframeDays: 14,
    skip: profile.role === 'coach' && !selectedClientId,
  });

  const latestSentiment = telemetrySentiments.length
    ? telemetrySentiments[telemetrySentiments.length - 1]
    : null;
  const priorityMilestones = telemetryMilestones
    .filter((milestone) => milestone.status !== 'achieved')
    .slice(0, 2);
  const recentWin = telemetryMilestones.find((milestone) => milestone.status === 'achieved');

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const aiCoach = useAiCoach(telemetrySubjectId ?? null);
  const lifestyle = useLifestyle(telemetrySubjectId ?? null, todayStr);
  const aiInlineInsights = aiCoach.data?.insights ?? [];
  const canShowAiInline = aiCoach.hasAccess && !aiCoach.requiresMfa && aiInlineInsights.length > 0;
  const agendaSnapshot = lifestyle.data?.agenda;
  const recommendedContent = lifestyle.data?.recommendedContent ?? [];
  const habitStreaks = lifestyle.data?.streaks ?? [];

  useEffect(() => {
    if (profile.role === 'coach') {
      if (selectedClientId) {
        fetchTodayData();
      } else {
        setLoading(false); // Stop loading if no client selected
      }
    } else {
      fetchTodayData();
    }
  }, [profile.id, selectedClientId]);

  const fetchTodayData = async () => {
    try {
      // Fetch meal plans for today
      const { data: mealPlansData, error: mealError } = await supabase
        .from('meal_plans')
        .select(`
          id,
          meal_type,
          plan_ingredients (
            ingredient_name,
            grams,
            carbs,
            proteins,
            fats,
            calories
          ),
          daily_notes (
            note_text
          )
        `)
        .eq('client_id', profile.role === 'coach' ? selectedClientId : profile.id)
        .eq('plan_date', todayStr);

      if (mealError) throw mealError;

      // Transform data
      const formattedMealPlans = mealPlansData?.map(plan => ({
        id: plan.id,
        meal_type: plan.meal_type,
        ingredients: plan.plan_ingredients || [],
        note: plan.daily_notes?.[0]?.note_text || ''
      })) || [];

      setMealPlans(formattedMealPlans);

      // Initialize notes state
      const initialNotes: { [key: string]: string } = {};
      formattedMealPlans.forEach(plan => {
        initialNotes[plan.id] = plan.note || '';
      });
      setNotes(initialNotes);

      // Fetch motivational note from coach (only for clients)
      if (profile.role === 'client') {
        const { data: motivationalData } = await supabase
          .from('coach_motivational_notes')
          .select('message')
          .eq('client_id', profile.id)
          .eq('note_date', todayStr)
          .single();

        setMotivationalNote(motivationalData);
      }

    } catch (error) {
      console.error('Error fetching today data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los datos del día"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async (mealPlanId: string) => {
    try {
      const noteText = notes[mealPlanId];
      
      // Check if note exists
      const { data: existingNote } = await supabase
        .from('daily_notes')
        .select('id')
        .eq('meal_plan_id', mealPlanId)
        .eq('client_id', profile.role === 'coach' ? selectedClientId : profile.id)
        .single();

      if (existingNote) {
        // Update existing note
        const { error } = await supabase
          .from('daily_notes')
          .update({ note_text: noteText })
          .eq('id', existingNote.id);

        if (error) throw error;
      } else {
        // Create new note
        const { error } = await supabase
          .from('daily_notes')
          .insert({
            client_id: profile.role === 'coach' ? selectedClientId : profile.id,
            meal_plan_id: mealPlanId,
            note_text: noteText
          });

        if (error) throw error;
      }

      toast({
        title: "Nota guardada",
        description: "Tu nota ha sido guardada correctamente"
      });

    } catch (error) {
      console.error('Error saving note:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la nota"
      });
    }
  };

  const deleteMeal = async (mealPlanId: string) => {
    try {
      // Delete ingredients first
      const { error: deleteIngredientsError } = await supabase
        .from('plan_ingredients')
        .delete()
        .eq('meal_plan_id', mealPlanId);

      if (deleteIngredientsError) throw deleteIngredientsError;

      // Delete daily notes
      const { error: deleteNotesError } = await supabase
        .from('daily_notes')
        .delete()
        .eq('meal_plan_id', mealPlanId);

      if (deleteNotesError) throw deleteNotesError;

      // Delete meal plan
      const { error: deleteMealError } = await supabase
        .from('meal_plans')
        .delete()
        .eq('id', mealPlanId);

      if (deleteMealError) throw deleteMealError;

      toast({
        title: "Comida eliminada",
        description: "La comida ha sido eliminada correctamente"
      });

      // Refresh data
      fetchTodayData();

    } catch (error) {
      console.error('Error deleting meal:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la comida"
      });
    }
  };

  const calculateTotals = () => {
    const totals = { calories: 0, carbs: 0, proteins: 0, fats: 0 };
    
    mealPlans.forEach(plan => {
      plan.ingredients.forEach(ingredient => {
        totals.calories += ingredient.calories;
        totals.carbs += ingredient.carbs;
        totals.proteins += ingredient.proteins;
        totals.fats += ingredient.fats;
      });
    });

    return totals;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-lg">Cargando plan del día...</div>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Client Selector for Coaches */}
      <ClientSelector
        profile={profile}
        selectedClientId={selectedClientId}
        onClientChange={setSelectedClientId}
      />
      {/* Header with date and totals */}
      <Card>
        <CardHeader>
          <CardTitle>
            {format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Mantén tu agenda integrada actualizada y revisa ajustes sugeridos por Gemini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{Math.round(totals.calories)}</p>
              <p className="text-sm text-muted-foreground">Kcal</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{Math.round(totals.carbs)}g</p>
              <p className="text-sm text-muted-foreground">Hidratos de Carbono</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{Math.round(totals.proteins)}g</p>
              <p className="text-sm text-muted-foreground">Proteínas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{Math.round(totals.fats)}g</p>
              <p className="text-sm text-muted-foreground">Grasas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {canShowAiInline && (
        <AiInlineInsights insights={aiInlineInsights} onOpenTab={onOpenAiTab} />
      )}

      {telemetrySubjectId && lifestyle.isLoading && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      )}

      {agendaSnapshot && agendaSnapshot.items.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Agenda integrada de hoy</CardTitle>
              <CardDescription>
                Combina comidas, entrenamiento y bienestar en un solo flujo. Marca lo que completes durante el día.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => lifestyle.autoAdjust()}
              disabled={!telemetrySubjectId || lifestyle.isLoading || lifestyle.isFetching}
            >
              Reajustar con métricas
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {agendaSnapshot.items.map((item) => (
              <div key={item.id} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {item.title}
                      {item.module_title ? ` · ${item.module_title}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.domain ?? item.item_type}
                      {item.start_time && ` · ${item.start_time}`}
                    </p>
                    {item.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.recommended && <Badge variant="outline">Sugerido</Badge>}
                    {item.premium && <Badge variant="secondary">Premium</Badge>}
                    <Button
                      size="sm"
                      onClick={() => lifestyle.markAgendaItem({ itemId: item.id, state: 'completado' })}
                      disabled={!telemetrySubjectId}
                    >
                      Marcar como hecho
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => lifestyle.markAgendaItem({ itemId: item.id, state: 'omitido' })}
                      disabled={!telemetrySubjectId}
                    >
                      Omitir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {telemetrySubjectId && (
        telemetryLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="space-y-3 py-6">
                  <div className="flex items-center gap-3">
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          (latestSentiment || priorityMilestones.length > 0 || recentWin) && (
            <div className="grid gap-4 md:grid-cols-2">
              {latestSentiment && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">Pulso emocional</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Registro del {format(new Date(latestSentiment.recorded_at), "dd 'de' MMMM", { locale: es })}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Ánimo</p>
                        <p className="text-2xl font-semibold">{latestSentiment.mood_score ?? '—'}/10</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Energía</p>
                        <p className="text-2xl font-semibold">{latestSentiment.energy_score ?? '—'}/10</p>
                      </div>
                      <Badge variant="outline" className="ml-auto">
                        {latestSentiment.note ? 'Reflexión' : 'Check-in'}
                      </Badge>
                    </div>
                    {latestSentiment.note && (
                      <p className="text-sm text-muted-foreground">“{latestSentiment.note}”</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {(priorityMilestones.length > 0 || recentWin) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Próximos hitos</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Cambios sugeridos automáticamente con base en tus indicadores.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {priorityMilestones.map((milestone) => (
                      <div key={milestone.id} className="rounded-lg border border-dashed p-3">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>{milestone.title}</span>
                          <Badge variant={milestone.status === 'at-risk' ? 'destructive' : 'secondary'} className="capitalize">
                            {milestone.status === 'at-risk' ? 'Atención' : 'Próximo'}
                          </Badge>
                        </div>
                        {milestone.milestone_date && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {format(new Date(milestone.milestone_date), "dd 'de' MMMM", { locale: es })}
                          </p>
                        )}
                        {milestone.description && (
                          <p className="mt-2 text-xs text-muted-foreground">{milestone.description}</p>
                        )}
                      </div>
                    ))}
                    {recentWin && (
                      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                        <p className="text-sm font-semibold">¡Celebración!</p>
                        <p className="text-xs text-muted-foreground">
                          {recentWin.title}
                          {recentWin.milestone_date
                            ? ` • ${format(new Date(recentWin.milestone_date), "dd 'de' MMMM", { locale: es })}`
                            : ''}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )
        )
      )}

      {habitStreaks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rachas activas</CardTitle>
            <CardDescription>Seguimiento automático de tus hábitos prioritarios.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {habitStreaks.map((streak) => (
              <div key={streak.module_id} className="rounded-lg border border-dashed px-4 py-3">
                <p className="text-sm font-semibold">{streak.module_title ?? 'Hábito'}</p>
                <p className="text-xs text-muted-foreground">{streak.streak_count} días consecutivos</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recommendedContent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendados para hoy</CardTitle>
            <CardDescription>
              Piezas rápidas para reforzar tus objetivos. Guárdalas en tu biblioteca personal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendedContent.map((content) => (
              <div key={content.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{content.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {content.content_type} · {content.duration_minutes ?? '—'} min
                  </p>
                  {content.excerpt && (
                    <p className="mt-1 text-sm text-muted-foreground">{content.excerpt}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {content.goal_tags?.map((tag) => (
                    <Badge key={tag} variant="outline" className="uppercase tracking-wide">
                      {tag}
                    </Badge>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => lifestyle.unlockContent({ contentId: content.id })}
                    disabled={!telemetrySubjectId}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Motivational note */}
      {motivationalNote && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Nota de tu coach</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-primary">{motivationalNote.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Meal plans */}
      <div className="space-y-4">
        {mealPlans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">
                No hay planes nutricionales para hoy.
                {profile.role === 'client' && ' Contacta con tu coach para obtener tu plan.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          mealPlans.map((meal) => (
            <Card key={meal.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="capitalize">{meal.meal_type}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {meal.ingredients.reduce((sum, ing) => sum + ing.calories, 0).toFixed(0)} kcal
                    </Badge>
                    <Button
                      onClick={() => deleteMeal(meal.id)}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Ingredients table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Ingrediente</th>
                        <th className="text-center p-2">Gramos</th>
                        <th className="text-center p-2">Hidratos de Carbono</th>
                        <th className="text-center p-2">Proteínas</th>
                        <th className="text-center p-2">Grasas</th>
                        <th className="text-center p-2">Kcal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meal.ingredients.map((ingredient, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2">{ingredient.ingredient_name}</td>
                          <td className="text-center p-2">{ingredient.grams}g</td>
                          <td className="text-center p-2">{ingredient.carbs.toFixed(1)}g</td>
                          <td className="text-center p-2">{ingredient.proteins.toFixed(1)}g</td>
                          <td className="text-center p-2">{ingredient.fats.toFixed(1)}g</td>
                          <td className="text-center p-2">{ingredient.calories.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Notes section */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notas:</label>
                  <Textarea
                    placeholder="Escribe aquí tus comentarios sobre esta comida..."
                    value={notes[meal.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [meal.id]: e.target.value })}
                    className="min-h-[80px]"
                  />
                  <Button 
                    onClick={() => saveNote(meal.id)}
                    size="sm"
                    variant="outline"
                  >
                    Guardar nota
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default TodayView;