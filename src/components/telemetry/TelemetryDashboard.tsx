import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  RefreshCcw,
  Smile,
  Watch,
} from 'lucide-react';
import { Profile } from '@/hooks/useAuth';
import ClientSelector from '@/components/ClientSelector';
import {
  useTelemetry,
  TelemetryMetric,
  BehaviorStreak,
  ClientMilestone,
  WearableConnection,
} from '@/hooks/useTelemetry';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useToast } from '@/components/ui/use-toast';

interface TelemetryDashboardProps {
  profile: Profile;
}

const metricCategoryLabels: Record<string, string> = {
  anthropometric: 'Antropometría',
  biometric: 'Biometría',
  behavioral: 'Hábitos',
  sentiment: 'Estado emocional',
};

const milestoneStatusVariant: Record<ClientMilestone['status'], 'default' | 'secondary' | 'destructive'> = {
  achieved: 'default',
  upcoming: 'secondary',
  'at-risk': 'destructive',
};

const TelemetryDashboard = ({ profile }: TelemetryDashboardProps) => {
  const [subjectId, setSubjectId] = useState<string | null>(profile.role === 'coach' ? null : profile.id);
  const [subjectLabel, setSubjectLabel] = useState<string>(profile.full_name || profile.email);
  const { metrics, streaks, sentiments, wearables, milestones, loading, hasData, refresh, ingestTelemetry, isRefreshing } = useTelemetry(
    subjectId,
    {
      timeframeDays: 45,
      skip: profile.role === 'coach' && !subjectId,
    },
  );
  const [activeMetricId, setActiveMetricId] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-ES', {
        maximumFractionDigits: 2,
      }),
    [],
  );
  const { toast } = useToast();

  const handleManualSync = async (connection: WearableConnection) => {
    try {
      setSyncingProvider(connection.provider);
      const now = new Date();
      const isoTimestamp = now.toISOString();
      const logicalDate = isoTimestamp.slice(0, 10);
      const sampleMetrics = [
        {
          slug: `${connection.provider}_steps`,
          value: Math.floor(Math.random() * 3000) + 5000,
          recordedAt: isoTimestamp,
          recordedFor: logicalDate,
          unit: 'pasos',
        },
        {
          slug: `${connection.provider}_restfulness`,
          value: Math.round(Math.random() * 40 + 60),
          recordedAt: isoTimestamp,
          recordedFor: logicalDate,
          unit: 'puntos',
        },
      ];
      await ingestTelemetry(connection.provider as 'apple_health' | 'google_fit' | 'lab_panel', sampleMetrics);
      toast({
        title: 'Sincronización completada',
        description: 'Los datos del proveedor se actualizaron exitosamente.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'No se pudo sincronizar',
        description: error instanceof Error ? error.message : 'Intenta nuevamente',
      });
    } finally {
      setSyncingProvider(null);
    }
  };

  useEffect(() => {
    if (profile.role !== 'coach') {
      setSubjectId(profile.id);
      setSubjectLabel(profile.full_name || profile.email);
    }
  }, [profile]);

  useEffect(() => {
    if (profile.role !== 'coach' || !subjectId) {
      return;
    }

    const fetchSubject = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', subjectId)
        .maybeSingle();

      if (data) {
        setSubjectLabel(data.full_name || data.email);
      }
    };

    fetchSubject();
  }, [profile.role, subjectId]);

  const numericMetrics = useMemo(
    () => metrics.filter((metric) => metric.latestSample?.value_numeric !== null),
    [metrics],
  );

  useEffect(() => {
    if (numericMetrics.length === 0) {
      setActiveMetricId(null);
      return;
    }

    if (!activeMetricId || !numericMetrics.some((metric) => metric.definition.id === activeMetricId)) {
      setActiveMetricId(numericMetrics[0].definition.id);
    }
  }, [numericMetrics, activeMetricId]);

  const activeMetric = useMemo(
    () => numericMetrics.find((metric) => metric.definition.id === activeMetricId) || numericMetrics[0] || null,
    [numericMetrics, activeMetricId],
  );

  const chartData = useMemo(() => {
    if (!activeMetric) {
      return [];
    }

    return activeMetric.samples
      .filter((sample) => sample.value_numeric !== null)
      .map((sample) => {
        const date = sample.recorded_for ? new Date(sample.recorded_for) : new Date(sample.recorded_at);
        return {
          label: format(date, 'dd MMM', { locale: es }),
          date: date.toISOString(),
          value: sample.value_numeric ?? 0,
        };
      });
  }, [activeMetric]);

  const topMetrics = useMemo(() => metrics.slice(0, 4), [metrics]);
  const highlightMilestones = useMemo(() => milestones.slice(0, 3), [milestones]);
  const recentSentiments = useMemo(() => sentiments.slice(-5), [sentiments]);

  const formatMetricValue = (metric: TelemetryMetric) => {
    const sample = metric.latestSample;
    if (!sample) {
      return '—';
    }

    if (sample.value_numeric !== null && sample.value_numeric !== undefined) {
      const precision = metric.definition.precision ?? 1;
      const formatted = numberFormatter.format(Number(sample.value_numeric.toFixed(precision)));
      return metric.definition.unit ? `${formatted} ${metric.definition.unit}` : formatted;
    }

    if (sample.value_text) {
      return sample.value_text;
    }

    if (sample.value_json) {
      const entries = Object.entries(sample.value_json);
      if (entries.length > 0) {
        const [key, value] = entries[0];
        return `${key}: ${value}`;
      }
    }

    return '—';
  };

  const renderWearableStatus = (connection: WearableConnection) => {
    const statusLabel =
      connection.status === 'connected' ? 'Sincronizado' : connection.status === 'error' ? 'Error' : 'En espera';
    const variant: 'default' | 'secondary' | 'destructive' =
      connection.status === 'connected' ? 'default' : connection.status === 'error' ? 'destructive' : 'secondary';

    return (
      <div key={connection.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Watch className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium capitalize">{connection.provider}</p>
            <p className="text-xs text-muted-foreground">
              Última sincronización:{' '}
              {connection.last_synced_at
                ? format(new Date(connection.last_synced_at), 'dd MMM yyyy, HH:mm', { locale: es })
                : 'Pendiente'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={variant} className="uppercase tracking-wide">
            {statusLabel}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleManualSync(connection)}
            disabled={Boolean(syncingProvider)}
          >
            <RefreshCcw className="mr-1 h-3 w-3" />
            {syncingProvider === connection.provider ? 'Sincronizando...' : 'Sincronizar ahora'}
          </Button>
        </div>
      </div>
    );
  };

  const renderStreak = (streak: BehaviorStreak) => {
    const completion = Math.min(100, Math.round((streak.current_streak / Math.max(streak.longest_streak, 1)) * 100));

    return (
      <div key={streak.id} className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium capitalize">{streak.habit_name || streak.habit_slug}</p>
            <p className="text-xs text-muted-foreground">Racha actual</p>
          </div>
          <Badge variant="outline">{streak.current_streak} días</Badge>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${completion}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mejor marca: {streak.longest_streak} días • Actualizado {format(new Date(streak.updated_at), 'dd MMM', { locale: es })}
        </p>
      </div>
    );
  };

  const emptyState = !loading && !hasData;

  return (
    <div className="space-y-6">
      {profile.role === 'coach' && (
        <ClientSelector profile={profile} selectedClientId={subjectId} onClientChange={setSubjectId} />
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Indicadores de bienestar</h2>
          <p className="text-sm text-muted-foreground">
            Resumen integral para {subjectLabel || 'tu cliente'}, con métricas, hábitos y estado emocional recientes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || isRefreshing || !subjectId}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {loading && !hasData ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="mt-4 h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && topMetrics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {topMetrics.map((metric) => (
            <Card key={metric.definition.id}>
              <CardHeader className="space-y-1">
                <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">
                  {metricCategoryLabels[metric.definition.category] || metric.definition.category}
                </CardDescription>
                <CardTitle className="text-lg font-semibold">{metric.definition.display_name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{formatMetricValue(metric)}</span>
                  <Badge variant="outline" className="capitalize">
                    {metric.latestSample?.source || 'manual'}
                  </Badge>
                </div>
                {metric.latestSample?.recorded_for && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Actualizado el {format(new Date(metric.latestSample.recorded_for), 'dd MMM yyyy', { locale: es })}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {emptyState && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Aún no hay datos de salud registrados
            </CardTitle>
            <CardDescription>
              Conecta un wearable, registra tus métricas manualmente o solicita a tu coach que cargue los últimos progresos.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!emptyState && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Tendencia principal
                </CardTitle>
                <CardDescription>Visualiza la evolución de tus métricas numéricas clave.</CardDescription>
              </div>
              <Select value={activeMetricId ?? undefined} onValueChange={setActiveMetricId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selecciona una métrica" />
                </SelectTrigger>
                <SelectContent>
                  {numericMetrics.map((metric) => (
                    <SelectItem key={metric.definition.id} value={metric.definition.id}>
                      {metric.definition.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {activeMetric && chartData.length > 0 ? (
                <ChartContainer
                  className="h-[260px]"
                  config={{
                    value: {
                      label: activeMetric.definition.display_name,
                      color: 'hsl(var(--primary))',
                    },
                  }}
                >
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => numberFormatter.format(value)}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-value)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  Selecciona una métrica con datos numéricos recientes.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smile className="h-4 w-4" />
                Estado emocional
              </CardTitle>
              <CardDescription>Últimos registros de ánimo y energía.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentSentiments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no se registran entradas de estado emocional.</p>
              ) : (
                recentSentiments.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{format(new Date(entry.recorded_at), 'dd MMM yyyy', { locale: es })}</span>
                      <Badge variant="outline">{entry.note ? 'Reflexión' : 'Rápido'}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Ánimo</p>
                        <p className="font-semibold">{entry.mood_score ?? '—'}/10</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Energía</p>
                        <p className="font-semibold">{entry.energy_score ?? '—'}/10</p>
                      </div>
                    </div>
                    {entry.note && <p className="mt-2 text-xs text-muted-foreground">“{entry.note}”</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!emptyState && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Rachas de hábitos
              </CardTitle>
              <CardDescription>Mantente al tanto de los hábitos que sostienen tu progreso.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {streaks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no se registran rachas activas.</p>
              ) : (
                streaks.map(renderStreak)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" />
                Hitos y alertas
              </CardTitle>
              <CardDescription>Próximos hitos logrados o en riesgo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {highlightMilestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay hitos registrados todavía.</p>
              ) : (
                highlightMilestones.map((milestone) => (
                  <div key={milestone.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{milestone.title}</span>
                      <Badge variant={milestoneStatusVariant[milestone.status]} className="capitalize">
                        {milestone.status === 'achieved'
                          ? 'Logrado'
                          : milestone.status === 'upcoming'
                          ? 'Próximo'
                          : 'Atención'}
                      </Badge>
                    </div>
                    {milestone.milestone_date && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {milestone.status === 'achieved' ? 'Completado' : 'Programado'} para el{' '}
                        {format(new Date(milestone.milestone_date), 'dd MMM yyyy', { locale: es })}
                      </p>
                    )}
                    {milestone.description && (
                      <p className="mt-2 text-xs text-muted-foreground">{milestone.description}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!emptyState && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Watch className="h-4 w-4" />
              Conexiones de wearables y laboratorios
            </CardTitle>
            <CardDescription>Gestiona integraciones con Apple Health, Google Fit y laboratorios aliados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {wearables.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Aún no hay dispositivos conectados. Vincula tus cuentas de salud para sincronizar métricas automáticamente.
              </div>
            ) : (
              wearables.map(renderWearableStatus)
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Las integraciones se sincronizan en segundo plano y registran auditorías para el equipo de coaches.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TelemetryDashboard;

