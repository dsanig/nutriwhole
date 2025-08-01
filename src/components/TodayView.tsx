import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClientSelector from '@/components/ClientSelector';

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
}

const TodayView = ({ profile }: TodayViewProps) => {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [motivationalNote, setMotivationalNote] = useState<MotivationalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { toast } = useToast();

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

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