import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Settings, Shield, ShieldOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'coach' | 'client';
  created_at: string;
  subscription_exempt: boolean;
}

interface ClientCoachAssignment {
  id: string;
  client: Profile;
  coach: Profile;
  assigned_at: string;
}

const AdminPanel = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ClientCoachAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  // Create user form state
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'client' as 'admin' | 'coach' | 'client'
  });

  // Assignment form state
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCoach, setSelectedCoach] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      // Fetch client-coach assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('clients_coaches')
        .select(`
          id,
          assigned_at,
          client:profiles!client_id (
            id,
            user_id,
            email,
            full_name,
            role,
            created_at,
            subscription_exempt
          ),
          coach:profiles!coach_id (
            id,
            user_id,
            email,
            full_name,
            role,
            created_at,
            subscription_exempt
          )
        `);

      if (assignmentsError) throw assignmentsError;
      setAssignments(assignmentsData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los datos"
      });
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create user in auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.fullName
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          throw new Error('No se pudo encontrar el perfil creado automáticamente.');
        }

        if (newUser.role !== 'client') {
          const { error: roleError } = await supabase.rpc('set_profile_role', {
            target_profile_id: profile.id,
            new_role: newUser.role
          });

          if (roleError) throw roleError;
        }
      }

      toast({
        title: "Usuario creado",
        description: `Usuario ${newUser.email} creado exitosamente`
      });

      setNewUser({ email: '', password: '', fullName: '', role: 'client' });
      setIsCreateDialogOpen(false);
      fetchData();

    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        variant: "destructive",
        title: "Error al crear usuario",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const assignClientToCoach = async () => {
    if (!selectedClient || !selectedCoach) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selecciona tanto cliente como coach"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('clients_coaches')
        .insert({
          client_id: selectedClient,
          coach_id: selectedCoach
        });

      if (error) throw error;

      toast({
        title: "Asignación creada",
        description: "Cliente asignado al coach exitosamente"
      });

      setSelectedClient('');
      setSelectedCoach('');
      fetchData();

    } catch (error: any) {
      console.error('Error assigning client:', error);
      toast({
        variant: "destructive",
        title: "Error en asignación",
        description: error.message
      });
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('clients_coaches')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Asignación eliminada",
        description: "La asignación ha sido eliminada"
      });

      fetchData();

    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const updateUserRole = async (profileId: string, newRole: 'admin' | 'coach' | 'client') => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: "Rol actualizado",
        description: "El rol del usuario ha sido actualizado"
      });

      fetchData();

    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const toggleSubscriptionExemption = async (profileId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_exempt: !currentStatus })
        .eq('id', profileId);

      if (error) throw error;

      toast({
        title: "Exención actualizada",
        description: `Exención de suscripción ${!currentStatus ? 'activada' : 'desactivada'}`
      });

      fetchData();

    } catch (error: any) {
      console.error('Error updating exemption:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
  };

  const clients = profiles.filter(p => p.role === 'client');
  const coaches = profiles.filter(p => p.role === 'coach');

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-lg">Cargando panel de administración...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Panel de Administración
          </CardTitle>
        </CardHeader>
      </Card>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Gestión de Usuarios</TabsTrigger>
          <TabsTrigger value="assignments">Asignaciones Coach-Cliente</TabsTrigger>
          <TabsTrigger value="exemptions">Exenciones de Suscripción</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Usuarios del Sistema</h3>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                </DialogHeader>
                <form onSubmit={createUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={newUser.fullName}
                      onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select 
                      value={newUser.role} 
                      onValueChange={(value: 'admin' | 'coach' | 'client') => 
                        setNewUser({ ...newUser, role: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Cliente</SelectItem>
                        <SelectItem value="coach">Coach</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Crear Usuario
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Fecha de Registro</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>{profile.email}</TableCell>
                      <TableCell>{profile.full_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={
                          profile.role === 'admin' ? 'destructive' :
                          profile.role === 'coach' ? 'default' : 'secondary'
                        }>
                          {profile.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(profile.created_at).toLocaleDateString('es-ES')}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={profile.role}
                          onValueChange={(value: 'admin' | 'coach' | 'client') => 
                            updateUserRole(profile.id, value)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">Cliente</SelectItem>
                            <SelectItem value="coach">Coach</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Asignar Cliente a Coach</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.full_name || client.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coach</Label>
                  <Select value={selectedCoach} onValueChange={setSelectedCoach}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar coach" />
                    </SelectTrigger>
                    <SelectContent>
                      {coaches.map((coach) => (
                        <SelectItem key={coach.id} value={coach.id}>
                          {coach.full_name || coach.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={assignClientToCoach}>
                  Asignar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asignaciones Actuales</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Coach</TableHead>
                    <TableHead>Fecha de Asignación</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        {assignment.client.full_name || assignment.client.email}
                      </TableCell>
                      <TableCell>
                        {assignment.coach.full_name || assignment.coach.email}
                      </TableCell>
                      <TableCell>
                        {new Date(assignment.assigned_at).toLocaleDateString('es-ES')}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => removeAssignment(assignment.id)}
                        >
                          Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exemptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Gestión de Exenciones de Suscripción
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Los usuarios exentos pueden acceder a la aplicación sin suscripción activa
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado de Exención</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>{profile.full_name || '-'}</TableCell>
                      <TableCell>{profile.email}</TableCell>
                      <TableCell>
                        <Badge variant={
                          profile.role === 'admin' ? 'destructive' :
                          profile.role === 'coach' ? 'default' : 'secondary'
                        }>
                          {profile.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {profile.subscription_exempt ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <Shield className="w-4 h-4" />
                              <span className="text-sm">Exento</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-500">
                              <ShieldOff className="w-4 h-4" />
                              <span className="text-sm">No exento</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={profile.subscription_exempt}
                            onCheckedChange={() => 
                              toggleSubscriptionExemption(profile.id, profile.subscription_exempt)
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {profile.subscription_exempt ? 'Quitar exención' : 'Otorgar exención'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;