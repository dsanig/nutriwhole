import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import ExcelUpload from './ExcelUpload';
import MealEditor from './MealEditor';
import ClientSelector from '@/components/ClientSelector';

interface DaySummary {
  date: string;
  totalCalories: number;
  totalCarbs: number;
  totalProteins: number;
  totalFats: number;
  mealCount: number;
}

interface DetailedDay {
  date: string;
  meals: Array<{
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
    notes: string;
  }>;
  coachNote?: string;
}

interface CalendarViewProps {
  profile: Profile;
}

const CalendarView = ({ profile }: CalendarViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [monthData, setMonthData] = useState<DaySummary[]>([]);
  const [selectedDay, setSelectedDay] = useState<DetailedDay | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingMeal, setEditingMeal] = useState<any>(null);
  const [editingDate, setEditingDate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile.role === 'coach' && selectedClientId) {
      fetchMonthData();
    } else if (profile.role !== 'coach') {
      fetchMonthData();
    }
  }, [currentDate, profile.id, selectedClientId]);

  const fetchMonthData = async () => {
    try {
      const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      // Fetch meal plans for the month
      const { data: mealPlansData, error } = await supabase
        .from('meal_plans')
        .select(`
          plan_date,
          meal_type,
          plan_ingredients (
            ingredient_name,
            grams,
            carbs,
            proteins,
            fats,
            calories
          )
        `)
        .eq('client_id', profile.role === 'coach' ? selectedClientId : profile.id)
        .gte('plan_date', startDate)
        .lte('plan_date', endDate);

      if (error) throw error;

      // Group by date and calculate totals
      const dayTotals: { [key: string]: DaySummary } = {};

      mealPlansData?.forEach(meal => {
        const date = meal.plan_date;
        if (!dayTotals[date]) {
          dayTotals[date] = {
            date,
            totalCalories: 0,
            totalCarbs: 0,
            totalProteins: 0,
            totalFats: 0,
            mealCount: 0
          };
        }

        dayTotals[date].mealCount++;
        
        meal.plan_ingredients?.forEach(ingredient => {
          dayTotals[date].totalCalories += ingredient.calories;
          dayTotals[date].totalCarbs += ingredient.carbs;
          dayTotals[date].totalProteins += ingredient.proteins;
          dayTotals[date].totalFats += ingredient.fats;
        });
      });

      setMonthData(Object.values(dayTotals));
    } catch (error) {
      console.error('Error fetching month data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDayDetails = async (date: string) => {
    try {
      // Fetch detailed meal plans for the day
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
        .eq('plan_date', date);

      if (mealError) throw mealError;

      // Fetch coach motivational note
      const { data: coachNoteData } = await supabase
        .from('coach_motivational_notes')
        .select('message')
        .eq('client_id', profile.role === 'coach' ? selectedClientId : profile.id)
        .eq('note_date', date)
        .single();

      const detailedDay: DetailedDay = {
        date,
        meals: mealPlansData?.map(meal => ({
          id: meal.id,
          meal_type: meal.meal_type,
          ingredients: meal.plan_ingredients || [],
          notes: meal.daily_notes?.[0]?.note_text || ''
        })) || [],
        coachNote: coachNoteData?.message
      };

      setSelectedDay(detailedDay);
      setIsDialogOpen(true);
    } catch (error) {
      console.error('Error fetching day details:', error);
    }
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    
    // Get the start of the week for the first day of the month
    // We want Monday to be the first day of the week (weekStartsOn: 1)
    const calendarStart = startOfWeek(start, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(end, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  const getDaySummary = (date: Date): DaySummary | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return monthData.find(day => day.date === dateStr) || null;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const deleteMeal = async (mealId: string) => {
    try {
      // Delete ingredients first
      const { error: deleteIngredientsError } = await supabase
        .from('plan_ingredients')
        .delete()
        .eq('meal_plan_id', mealId);

      if (deleteIngredientsError) throw deleteIngredientsError;

      // Delete daily notes
      const { error: deleteNotesError } = await supabase
        .from('daily_notes')
        .delete()
        .eq('meal_plan_id', mealId);

      if (deleteNotesError) throw deleteNotesError;

      // Delete meal plan
      const { error: deleteMealError } = await supabase
        .from('meal_plans')
        .delete()
        .eq('id', mealId);

      if (deleteMealError) throw deleteMealError;

      // Refresh data
      fetchMonthData();
      if (selectedDay) {
        fetchDayDetails(selectedDay.date);
      }

    } catch (error) {
      console.error('Error deleting meal:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-lg">Cargando calendario...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Client Selector for Coaches */}
      <ClientSelector
        profile={profile}
        selectedClientId={selectedClientId}
        onClientChange={setSelectedClientId}
      />
      
      {/* Calendar Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigateMonth('prev')}
              className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded"
            >
              ← Anterior
            </button>
            <CardTitle className="text-xl">
              {format(currentDate, "MMMM yyyy", { locale: es })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <ExcelUpload profile={profile} onUploadComplete={fetchMonthData} />
              <button 
                onClick={() => navigateMonth('next')}
                className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded"
              >
                Siguiente →
              </button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="text-center font-medium text-sm p-2">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {getDaysInMonth().map(date => {
              const daySummary = getDaySummary(date);
              const isToday = isSameDay(date, new Date());
              
              return (
                <div
                  key={date.toISOString()}
                  className={`
                    p-3 text-left border rounded-lg transition-colors min-h-[100px] relative
                    ${isToday ? 'ring-2 ring-primary' : ''}
                    ${!isSameMonth(date, currentDate) ? 'opacity-50' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-sm">
                      {format(date, 'd')}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setEditingDate(format(date, 'yyyy-MM-dd'));
                        setEditingMeal(null);
                        setIsEditorOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {daySummary ? (
                    <div className="space-y-1 cursor-pointer" onClick={() => fetchDayDetails(format(date, 'yyyy-MM-dd'))}>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(daySummary.totalCalories)} kcal
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {daySummary.mealCount} comidas
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Sin comidas
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(new Date(selectedDay.date), "EEEE, d 'de' MMMM", { locale: es })}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDay && (
            <div className="space-y-4">
              {/* Coach note */}
              {selectedDay.coachNote && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-lg">Nota del coach</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-primary">{selectedDay.coachNote}</p>
                  </CardContent>
                </Card>
              )}

              {/* Meals */}
              {selectedDay.meals.map((meal, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="capitalize">{meal.meal_type}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingMeal(meal);
                            setEditingDate(selectedDay.date);
                            setIsEditorOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMeal(meal.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                          {meal.ingredients.map((ingredient, idx) => (
                            <tr key={idx} className="border-b">
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
                    
                    {meal.notes && (
                      <div className="mt-3 p-3 bg-muted rounded">
                        <p className="text-sm font-medium mb-1">Notas del cliente:</p>
                        <p className="text-sm">{meal.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Meal Editor */}
      <MealEditor
        profile={profile}
        date={editingDate}
        meal={editingMeal}
        isOpen={isEditorOpen}
        selectedClientId={selectedClientId}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingMeal(null);
          setEditingDate('');
        }}
        onSave={() => {
          fetchMonthData();
          if (selectedDay) {
            fetchDayDetails(selectedDay.date);
          }
        }}
      />
    </div>
  );
};

export default CalendarView;