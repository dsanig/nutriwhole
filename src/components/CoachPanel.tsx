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
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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

      // Get assigned clients
      const { data: assignedClients, error: assignedError } = await supabase
        .from('clients_coaches')
        .select(`
          client_id,
          assigned_at,
          profiles!clients_coaches_client_id_fkey (
            id,
            user_id,
            email,
            full_name
          )
        `)
        .eq('coach_id', coachProfile.id);

      if (assignedError) throw assignedError;

      const clientsData = assignedClients?.map(assignment => ({
        id: assignment.profiles.id,
        user_id: assignment.profiles.user_id,
        email: assignment.profiles.email,
        full_name: assignment.profiles.full_name,
        assigned_at: assignment.assigned_at
      })) || [];

      setClients(clientsData);

      // Get available clients (not assigned to this coach)
      const assignedClientIds = clientsData.map(client => client.id);
      const { data: allClients, error: allClientsError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name')
        .eq('role', 'client')
        .not('id', 'in', `(${assignedClientIds.join(',') || 'null'})`);

      if (allClientsError) throw allClientsError;

      setAvailableClients((allClients || []).map(client => ({
        ...client,
        assigned_at: ''
      })));

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

  const assignClient = async (clientId: string) => {
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
        .insert({
          coach_id: coachProfile.id,
          client_id: clientId
        });

      if (error) throw error;

      toast({
        title: "Cliente asignado",
        description: "El cliente ha sido asignado exitosamente"
      });

      setIsAddDialogOpen(false);
      fetchCoachClients();

    } catch (error) {
      console.error('Error assigning client:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo asignar el cliente"
      });
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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Asignar Cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignar Cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Clientes Disponibles</Label>
                    {availableClients.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        No hay clientes disponibles para asignar
                      </p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {availableClients.map((client) => (
                          <div
                            key={client.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{client.full_name || client.email}</p>
                              <p className="text-sm text-muted-foreground">{client.email}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => assignClient(client.id)}
                            >
                              Asignar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
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
                Comienza asignando tu primer cliente para gestionar sus planes nutricionales
              </p>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Asignar Primer Cliente
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