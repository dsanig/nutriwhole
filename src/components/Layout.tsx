import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Home, Settings, LogOut, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import TodayView from '@/components/TodayView';
import CalendarView from '@/components/CalendarView';
import AdminPanel from '@/components/AdminPanel';
import CoachPanel from '@/components/CoachPanel';
import ClientPanel from '@/components/ClientPanel';
import { SubscriptionRequired } from '@/components/SubscriptionRequired';
import { SubscriptionStatus } from '@/components/SubscriptionStatus';

const Layout = () => {
  const { user, profile, signOut, loading } = useAuth();
  const { subscriptionStatus, isLoading: subscriptionLoading, checkSubscription } = useSubscription();
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando perfil...</div>
      </div>
    );
  }

  // Check subscription for clients (allow exempt accounts)
  if (profile.role === 'client' && !profile.subscription_exempt && !subscriptionStatus.subscribed) {
    return (
      <SubscriptionRequired
        onRetryCheck={checkSubscription}
        isChecking={subscriptionLoading}
      />
    );
  }

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error al cerrar sesión",
        description: error.message
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">NutriWhole</h1>
              <p className="text-sm text-muted-foreground">
                Gestión de planes nutricionales
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <div className="text-sm">
                  <p className="font-medium">{profile.full_name || profile.email}</p>
                  <p className="text-muted-foreground capitalize">{profile.role}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Show subscription status for clients */}
        {profile.role === 'client' && subscriptionStatus.subscribed && (
          <SubscriptionStatus />
        )}
        
        <Tabs defaultValue={profile.role === 'client' ? 'client' : 'today'} className="w-full">
          <TabsList className={`grid w-full mb-6 ${
            profile.role === 'admin' ? 'grid-cols-3' : 
            profile.role === 'coach' ? 'grid-cols-3' : 
            profile.role === 'client' ? 'grid-cols-3' : 'grid-cols-2'
          }`}>
            {profile.role !== 'client' && (
              <TabsTrigger value="today" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Hoy
              </TabsTrigger>
            )}
            {profile.role !== 'client' && (
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Calendario
              </TabsTrigger>
            )}
            {profile.role === 'admin' && (
              <TabsTrigger value="admin" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Administración
              </TabsTrigger>
            )}
            {profile.role === 'coach' && (
              <TabsTrigger value="coach" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Mis Clientes
              </TabsTrigger>
            )}
            {profile.role === 'client' && (
              <>
                <TabsTrigger value="client" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Mi Coach
                </TabsTrigger>
                <TabsTrigger value="today" className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Hoy
                </TabsTrigger>
                <TabsTrigger value="calendar" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Calendario
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="today">
            <TodayView profile={profile} />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarView profile={profile} />
          </TabsContent>

          {profile.role === 'admin' && (
            <TabsContent value="admin">
              <AdminPanel />
            </TabsContent>
          )}

          {profile.role === 'coach' && (
            <TabsContent value="coach">
              <CoachPanel />
            </TabsContent>
          )}

          {profile.role === 'client' && (
            <TabsContent value="client">
              <ClientPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default Layout;