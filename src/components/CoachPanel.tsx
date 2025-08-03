import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Client {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  assigned_at: string;
}

const CoachPanel = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCoachClients();
  }, []);

  const fetchCoachClients = async () => {
    try {
      setLoading(true);
      
      // Get current coach profile
      const { data: coachProfile, error: coachError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (coachError) throw coachError;

      console.log('Coach profile:', coachProfile);

      // Get assigned clients with manual join
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('clients_coaches')
        .select('client_id, assigned_at')
        .eq('coach_id', coachProfile.id);

      console.log('Assignment data:', assignmentData);
      if (assignmentError) throw assignmentError;

      if (!assignmentData || assignmentData.length === 0) {
        console.log('No assignments found for coach');
        setClients([]);
        setLoading(false);
        return;
      }

      // Get client profiles separately
      const clientIds = assignmentData.map(assignment => assignment.client_id);
      console.log('Client IDs:', clientIds);
      
      const { data: clientProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name')
        .in('id', clientIds);

      console.log('Client profiles:', clientProfiles);
      if (profileError) throw profileError;

      // Combine assignment data with profiles
      const clientsData = assignmentData.map(assignment => {
        const profile = clientProfiles?.find(p => p.id === assignment.client_id);
        if (!profile) {
          console.warn('Profile not found for client_id:', assignment.client_id);
          return null;
        }
        return {
          id: profile.id,
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name,
          assigned_at: assignment.assigned_at
        };
      }).filter(Boolean);

      setClients(clientsData);

    } catch (error) {
      console.error('Error fetching coach clients:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los clientes"
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewClient = async () => {
    if (!newClientEmail.trim() || !newClientName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor completa todos los campos"
      });
      return;
    }

    try {
      setIsCreating(true);

      // Get current coach profile
      const { data: coachProfile, error: coachError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (coachError) throw coachError;

      // Create new user account with temporary password
      const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newClientEmail,
        password: tempPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: newClientName,
            role: 'client'
          }
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('No se pudo crear el usuario');
      }

      // Wait a moment for the profile to be created by the trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the created client profile
      const { data: clientProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', authData.user.id)
        .single();

      if (profileError) throw profileError;

      // Assign the client to the coach
      const { error: assignError } = await supabase
        .from('clients_coaches')
        .insert({
          coach_id: coachProfile.id,
          client_id: clientProfile.id
        });

      if (assignError) throw assignError;

      toast({
        title: "Cliente creado",
        description: `Cliente ${newClientName} ha sido creado y asignado exitosamente`
      });

      setIsCreateDialogOpen(false);
      setNewClientEmail('');
      setNewClientName('');
      fetchCoachClients();

    } catch (error) {
      console.error('Error creating client:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear el cliente"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const removeClient = async (clientId: string) => {
    try {
      // Get current coach profile
      const { data: coachProfile, error: coachError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (coachError) throw coachError;

      const { error } = await supabase
        .from('clients_coaches')
        .delete()
        .eq('coach_id', coachProfile.id)
        .eq('client_id', clientId);

      if (error) throw error;

      toast({
        title: "Cliente desasignado",
        description: "El cliente ha sido desasignado exitosamente"
      });

      fetchCoachClients();

    } catch (error) {
      console.error('Error removing client:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo desasignar el cliente"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Cargando clientes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <CardTitle>Gestión de Clientes</CardTitle>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Nuevo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="clientName">Nombre Completo</Label>
                    <Input
                      id="clientName"
                      type="text"
                      placeholder="Nombre del cliente"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientEmail">Email</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      placeholder="email@ejemplo.com"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsCreateDialogOpen(false);
                        setNewClientEmail('');
                        setNewClientName('');
                      }}
                      disabled={isCreating}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      onClick={createNewClient}
                      disabled={isCreating}
                    >
                      {isCreating ? 'Creando...' : 'Crear Cliente'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No tienes clientes asignados</h3>
              <p className="text-muted-foreground mb-4">
                Comienza creando tu primer cliente para gestionar sus planes nutricionales
              </p>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Primer Cliente
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Fecha de Asignación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      {client.full_name || 'Sin nombre'}
                    </TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>
                      {new Date(client.assigned_at).toLocaleDateString('es-ES')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Activo</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Desasignar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Desasignar cliente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción desasignará al cliente "{client.full_name || client.email}" de tu lista. 
                              El cliente conservará sus datos pero ya no aparecerá en tu panel.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeClient(client.id)}>
                              Desasignar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachPanel;