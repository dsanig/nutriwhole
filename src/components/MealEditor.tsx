import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Ingredient {
  id?: string;
  ingredient_name: string;
  grams: number;
  carbs: number;
  proteins: number;
  fats: number;
  calories: number;
}

interface Meal {
  id?: string;
  meal_type: string;
  ingredients: Ingredient[];
}

interface MealEditorProps {
  profile: Profile;
  date: string;
  meal?: Meal;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const MealEditor = ({ profile, date, meal, isOpen, onClose, onSave }: MealEditorProps) => {
  const [mealType, setMealType] = useState(meal?.meal_type || 'desayuno');
  const [ingredients, setIngredients] = useState<Ingredient[]>(meal?.ingredients || []);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (meal) {
      setMealType(meal.meal_type);
      setIngredients(meal.ingredients);
    } else {
      setMealType('desayuno');
      setIngredients([]);
    }
  }, [meal]);

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      {
        ingredient_name: '',
        grams: 0,
        carbs: 0,
        proteins: 0,
        fats: 0,
        calories: 0
      }
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    const updatedIngredients = [...ingredients];
    updatedIngredients[index] = {
      ...updatedIngredients[index],
      [field]: value
    };
    setIngredients(updatedIngredients);
  };

  const handleSave = async () => {
    if (!mealType || ingredients.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor selecciona un tipo de comida y añade al menos un ingrediente"
      });
      return;
    }

    if (ingredients.some(ing => !ing.ingredient_name.trim())) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Todos los ingredientes deben tener un nombre"
      });
      return;
    }

    setIsSaving(true);
    try {
      if (meal?.id) {
        // Update existing meal
        const { error: updateError } = await supabase
          .from('meal_plans')
          .update({ meal_type: mealType })
          .eq('id', meal.id);

        if (updateError) throw updateError;

        // Delete existing ingredients
        const { error: deleteError } = await supabase
          .from('plan_ingredients')
          .delete()
          .eq('meal_plan_id', meal.id);

        if (deleteError) throw deleteError;

        // Insert updated ingredients
        const ingredientsToInsert = ingredients.map(ingredient => ({
          meal_plan_id: meal.id,
          ingredient_name: ingredient.ingredient_name,
          grams: ingredient.grams,
          carbs: ingredient.carbs,
          proteins: ingredient.proteins,
          fats: ingredient.fats,
          calories: ingredient.calories
        }));

        const { error: insertError } = await supabase
          .from('plan_ingredients')
          .insert(ingredientsToInsert);

        if (insertError) throw insertError;

      } else {
        // Create new meal
        const { data: mealPlan, error: mealError } = await supabase
          .from('meal_plans')
          .insert({
            client_id: profile.id,
            coach_id: profile.id, // For now, assuming self-management
            plan_date: date,
            meal_type: mealType
          })
          .select()
          .single();

        if (mealError) throw mealError;

        // Insert ingredients
        const ingredientsToInsert = ingredients.map(ingredient => ({
          meal_plan_id: mealPlan.id,
          ingredient_name: ingredient.ingredient_name,
          grams: ingredient.grams,
          carbs: ingredient.carbs,
          proteins: ingredient.proteins,
          fats: ingredient.fats,
          calories: ingredient.calories
        }));

        const { error: insertError } = await supabase
          .from('plan_ingredients')
          .insert(ingredientsToInsert);

        if (insertError) throw insertError;
      }

      toast({
        title: "¡Éxito!",
        description: meal?.id ? "Comida actualizada correctamente" : "Comida creada correctamente"
      });

      onSave();
      onClose();

    } catch (error) {
      console.error('Error saving meal:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al guardar la comida"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {meal?.id ? 'Editar Comida' : 'Nueva Comida'} - {date}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Meal Type */}
          <div className="space-y-2">
            <Label htmlFor="meal-type">Tipo de comida</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo de comida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desayuno">Desayuno</SelectItem>
                <SelectItem value="almuerzo">Almuerzo</SelectItem>
                <SelectItem value="merienda">Merienda</SelectItem>
                <SelectItem value="cena">Cena</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ingredients */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Ingredientes</Label>
              <Button onClick={addIngredient} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Añadir ingrediente
              </Button>
            </div>

            {ingredients.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">
                    No hay ingredientes. Haz clic en "Añadir ingrediente" para empezar.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {ingredients.map((ingredient, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Ingrediente {index + 1}</CardTitle>
                        <Button
                          onClick={() => removeIngredient(index)}
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="md:col-span-2 lg:col-span-1">
                          <Label htmlFor={`ingredient-name-${index}`}>Nombre</Label>
                          <Input
                            id={`ingredient-name-${index}`}
                            value={ingredient.ingredient_name}
                            onChange={(e) => updateIngredient(index, 'ingredient_name', e.target.value)}
                            placeholder="Nombre del ingrediente"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`ingredient-grams-${index}`}>Gramos</Label>
                          <Input
                            id={`ingredient-grams-${index}`}
                            type="number"
                            value={ingredient.grams}
                            onChange={(e) => updateIngredient(index, 'grams', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`ingredient-carbs-${index}`}>Hidratos de Carbono (g)</Label>
                          <Input
                            id={`ingredient-carbs-${index}`}
                            type="number"
                            step="0.1"
                            value={ingredient.carbs}
                            onChange={(e) => updateIngredient(index, 'carbs', parseFloat(e.target.value) || 0)}
                            placeholder="0.0"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`ingredient-proteins-${index}`}>Proteínas (g)</Label>
                          <Input
                            id={`ingredient-proteins-${index}`}
                            type="number"
                            step="0.1"
                            value={ingredient.proteins}
                            onChange={(e) => updateIngredient(index, 'proteins', parseFloat(e.target.value) || 0)}
                            placeholder="0.0"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`ingredient-fats-${index}`}>Grasas (g)</Label>
                          <Input
                            id={`ingredient-fats-${index}`}
                            type="number"
                            step="0.1"
                            value={ingredient.fats}
                            onChange={(e) => updateIngredient(index, 'fats', parseFloat(e.target.value) || 0)}
                            placeholder="0.0"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`ingredient-calories-${index}`}>Calorías</Label>
                          <Input
                            id={`ingredient-calories-${index}`}
                            type="number"
                            step="0.1"
                            value={ingredient.calories}
                            onChange={(e) => updateIngredient(index, 'calories', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Guardando..." : meal?.id ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MealEditor;