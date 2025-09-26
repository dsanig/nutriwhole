import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ExcelUploadProps {
  profile: Profile;
  onUploadComplete: () => void;
}

interface ParsedMealData {
  date: string;
  mealType: string;
  ingredients: Array<{
    name: string;
    grams: number;
    carbs: number;
    proteins: number;
    fats: number;
    calories: number;
  }>;
}

const ExcelUpload = ({ profile, onUploadComplete }: ExcelUploadProps) => {
  const [startDate, setStartDate] = useState<Date>();
  const [file, setFile] = useState<File | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseExcelFile = (file: File): Promise<ParsedMealData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          const parsedData: ParsedMealData[] = [];
          const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          const mealTypes = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];

          // Find header row with days
          let headerRowIndex = -1;
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i] as string[];
            if (row && row.some(cell => daysOfWeek.includes(cell))) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
            throw new Error('No se encontró la fila de encabezados con los días de la semana');
          }

          const headerRow = jsonData[headerRowIndex] as string[];
          const dayColumns: { [key: string]: number } = {};
          
          headerRow.forEach((header, index) => {
            if (daysOfWeek.includes(header)) {
              dayColumns[header] = index;
            }
          });

          // Process each row after header
          for (let rowIndex = headerRowIndex + 1; rowIndex < jsonData.length; rowIndex++) {
            const row = jsonData[rowIndex] as string[];
            if (!row || row.length === 0) continue;

            const week = row[0]; // Column A: Semana
            const mealType = row[1]; // Column B: Comida

            if (!mealTypes.includes(mealType)) continue;

            // Process each day column
            Object.entries(dayColumns).forEach(([dayName, columnIndex]) => {
              const cellContent = row[columnIndex];
              if (!cellContent || typeof cellContent !== 'string') return;

              const ingredients = parseIngredients(cellContent);
              if (ingredients.length > 0) {
                const dayIndex = daysOfWeek.indexOf(dayName);
                
                // Calculate date considering week number
                const weekNumber = week === 'Semana 1' ? 0 : 1; // Handle both weeks
                const totalDayOffset = (weekNumber * 7) + dayIndex;
                
                const dateForDay = new Date(startDate!);
                dateForDay.setDate(startDate!.getDate() + totalDayOffset);

                parsedData.push({
                  date: format(dateForDay, 'yyyy-MM-dd'),
                  mealType: mealType.toLowerCase(),
                  ingredients
                });
              }
            });
          }

          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const parseIngredients = (cellContent: string) => {
    const ingredients: any[] = [];
    
    // Split by common separators and clean up
    const items = cellContent.split(/[,\.]\s*(?=[A-ZÁÉÍÓÚ])/).filter(item => item.trim());
    
    items.forEach(item => {
      const cleanItem = item.trim();
      if (!cleanItem) return;

      // Extract ingredient name and weight
      const match = cleanItem.match(/^(.+?)\s*\((\d+(?:,\d+)?(?:\.\d+)?)\s*g?\)/);
      if (match) {
        const name = match[1].trim();
        const grams = parseFloat(match[2].replace(',', '.'));
        
        // Estimate nutritional values (these would ideally come from a nutritional database)
        const calories = estimateCalories(name, grams);
        const carbs = estimateCarbs(name, grams);
        const proteins = estimateProteins(name, grams);
        const fats = estimateFats(name, grams);

        ingredients.push({
          name,
          grams,
          carbs,
          proteins,
          fats,
          calories
        });
      }
    });

    return ingredients;
  };

  // Basic nutritional estimation functions (simplified)
  const estimateCalories = (name: string, grams: number): number => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('aceite')) return grams * 8.84;
    if (lowerName.includes('pollo') || lowerName.includes('pavo')) return grams * 1.65;
    if (lowerName.includes('pescado') || lowerName.includes('salmón')) return grams * 2.06;
    if (lowerName.includes('arroz')) return grams * 1.30;
    if (lowerName.includes('avena')) return grams * 3.89;
    if (lowerName.includes('huevo')) return grams * 1.55;
    if (lowerName.includes('leche')) return grams * 0.42;
    if (lowerName.includes('yogur')) return grams * 0.59;
    if (lowerName.includes('queso')) return grams * 4.02;
    if (lowerName.includes('aguacate')) return grams * 1.60;
    if (lowerName.includes('almendra')) return grams * 5.79;
    if (lowerName.includes('nueces')) return grams * 6.54;
    return grams * 1.5; // Default estimate
  };

  const estimateCarbs = (name: string, grams: number): number => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('arroz')) return grams * 0.28;
    if (lowerName.includes('avena')) return grams * 0.66;
    if (lowerName.includes('pan')) return grams * 0.49;
    if (lowerName.includes('pasta')) return grams * 0.25;
    if (lowerName.includes('plátano')) return grams * 0.23;
    if (lowerName.includes('manzana')) return grams * 0.14;
    if (lowerName.includes('leche')) return grams * 0.048;
    if (lowerName.includes('yogur')) return grams * 0.04;
    if (lowerName.includes('verdura') || lowerName.includes('espinaca')) return grams * 0.036;
    return grams * 0.05; // Default estimate
  };

  const estimateProteins = (name: string, grams: number): number => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('pollo') || lowerName.includes('pavo')) return grams * 0.31;
    if (lowerName.includes('pescado') || lowerName.includes('salmón')) return grams * 0.25;
    if (lowerName.includes('huevo')) return grams * 0.13;
    if (lowerName.includes('queso')) return grams * 0.25;
    if (lowerName.includes('leche')) return grams * 0.034;
    if (lowerName.includes('yogur')) return grams * 0.10;
    if (lowerName.includes('almendra')) return grams * 0.21;
    if (lowerName.includes('nueces')) return grams * 0.15;
    if (lowerName.includes('avena')) return grams * 0.17;
    return grams * 0.02; // Default estimate
  };

  const estimateFats = (name: string, grams: number): number => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('aceite')) return grams * 1.0;
    if (lowerName.includes('aguacate')) return grams * 0.15;
    if (lowerName.includes('almendra')) return grams * 0.50;
    if (lowerName.includes('nueces')) return grams * 0.65;
    if (lowerName.includes('salmón')) return grams * 0.13;
    if (lowerName.includes('pollo')) return grams * 0.036;
    if (lowerName.includes('huevo')) return grams * 0.10;
    if (lowerName.includes('queso')) return grams * 0.33;
    if (lowerName.includes('leche')) return grams * 0.01;
    return grams * 0.01; // Default estimate
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!startDate || !file) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor selecciona una fecha de inicio y un archivo"
      });
      return;
    }

    setIsUploading(true);
    try {
      // Parse Excel file
      const parsedData = await parseExcelFile(file);
      
      if (parsedData.length === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
      }

      // Delete existing meal plans for the date range
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13); // Two weeks (14 days)
      
      const { error: deleteError } = await supabase
        .from('meal_plans')
        .delete()
        .eq('client_id', profile.id)
        .gte('plan_date', format(startDate, 'yyyy-MM-dd'))
        .lte('plan_date', format(endDate, 'yyyy-MM-dd'));

      if (deleteError) throw deleteError;

      // Insert new meal plans
      for (const mealData of parsedData) {
        const { data: mealPlan, error: mealError } = await supabase
          .from('meal_plans')
          .insert({
            client_id: profile.id,
            coach_id: profile.id, // For now, assuming coach uploads for themselves
            plan_date: mealData.date,
            meal_type: mealData.mealType
          })
          .select()
          .single();

        if (mealError) throw mealError;

        // Insert ingredients for this meal plan
        const ingredientsToInsert = mealData.ingredients.map(ingredient => ({
          meal_plan_id: mealPlan.id,
          ingredient_name: ingredient.name,
          grams: ingredient.grams,
          carbs: ingredient.carbs,
          proteins: ingredient.proteins,
          fats: ingredient.fats,
          calories: ingredient.calories
        }));

        const { error: ingredientsError } = await supabase
          .from('plan_ingredients')
          .insert(ingredientsToInsert);

        if (ingredientsError) throw ingredientsError;
      }

      toast({
        title: "¡Éxito!",
        description: `Se han importado ${parsedData.length} comidas desde el archivo Excel`
      });

      setIsDialogOpen(false);
      onUploadComplete();
      setFile(null);
      setStartDate(undefined);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error uploading Excel:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Error al procesar el archivo Excel"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Subir Plan Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Subir Plan Nutricional desde Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Fecha de inicio de la semana</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="excel-file">Archivo Excel (.xlsx)</Label>
            <Input
              ref={fileInputRef}
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {file.name}
              </p>
            )}
          </div>

          <Card className="p-4 bg-muted/50">
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Formato esperado:</strong>
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Primera columna: Semana</li>
                <li>• Segunda columna: Tipo de comida (Desayuno, Almuerzo, Merienda, Cena)</li>
                <li>• Columnas siguientes: Días de la semana (Lunes a Domingo)</li>
                <li>• Cada celda debe contener ingredientes con formato: "Ingrediente (XXXg)"</li>
              </ul>
            </CardContent>
          </Card>

          <Button 
            onClick={handleUpload} 
            disabled={!startDate || !file || isUploading}
            className="w-full"
          >
            {isUploading ? "Procesando..." : "Subir Plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelUpload;