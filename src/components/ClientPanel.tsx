import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AssignmentRequest {
  id: string;
  coach_id: string;
  coach_email: string;
  coach_name: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
}

interface Coach {
  id: string;
  email: string;
  full_name: string;
}

const ClientPanel = () => {
  const [requests, setRequests] = useState<AssignmentRequest[]>([]);
  const [currentCoach, setCurrentCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [coachEmail, setCoachEmail] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchClientData();
  }, []);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      
      // Get current client profile
      const { data: clientProfile, error: clientError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (clientError) throw clientError;

      // Check if client is already assigned to a coach
      const { data: assignment, error: assignmentError } = await supabase
        .from('clients_coaches')
        .select(`
          coach_id,
          coach:profiles!clients_coaches_coach_id_fkey(email, full_name)
        `)
        .eq('client_id', clientProfile.id)
        .maybeSingle();

      if (assignmentError) throw assignmentError;

      if (assignment) {
        setCurrentCoach({
          id: assignment.coach_id,
          email: assignment.coach.email,
          full_name: assignment.coach.full_name
        });
      }

      // Get assignment requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('coach_assignment_requests')
        .select(`
          id,
          coach_id,
          status,
          message,
          created_at,
          coach:profiles!coach_assignment_requests_coach_id_fkey(email, full_name)
        `)
        .eq('client_id', clientProfile.id)
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      const formattedRequests: AssignmentRequest[] = requestsData.map(request => ({
        id: request.id,
        coach_id: request.coach_id,
        coach_email: request.coach.email,
        coach_name: request.coach.full_name,
        status: request.status as 'pending' | 'accepted' | 'rejected',
        message: request.message,
        created_at: request.created_at
      }));

      setRequests(formattedRequests);

    } catch (error) {
      console.error('Error fetching client data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los datos"
      });
    } finally {
      setLoading(false);
    }
  };

  const requestCoachAssignment = async () => {
    if (!coachEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingresa el email del coach"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Get current client profile
      const { data: clientProfile, error: clientError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (clientError) throw clientError;

      // Find coach by email
      const { data: coachProfile, error: coachError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', coachEmail.trim())
        .eq('role', 'coach')
        .maybeSingle();

      if (coachError) throw coachError;

      if (!coachProfile) {
        toast({
          variant: "destructive",
          title: "Coach no encontrado",
          description: "No se encontró un coach con ese email"
        });
        return;
      }

      // Check if already has a pending request to this coach
      const { data: existingRequest, error: existingError } = await supabase
        .from('coach_assignment_requests')
        .select('id')
        .eq('client_id', clientProfile.id)
        .eq('coach_id', coachProfile.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingRequest) {
        toast({
          variant: "destructive",
          title: "Solicitud ya enviada",
          description: "Ya tienes una solicitud pendiente con este coach"
        });
        return;
      }

      // Create assignment request
      const { error: requestError } = await supabase
        .from('coach_assignment_requests')
        .insert({
          client_id: clientProfile.id,
          coach_id: coachProfile.id,
          message: requestMessage.trim() || null
        });

      if (requestError) throw requestError;

      toast({
        title: "Solicitud enviada",
        description: "Tu solicitud ha sido enviada al coach"
      });

      setIsRequestDialogOpen(false);
      setCoachEmail('');
      setRequestMessage('');
      fetchClientData();

    } catch (error) {
      console.error('Error requesting coach assignment:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo enviar la solicitud"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'accepted':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'accepted':
        return 'default';
      case 'rejected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Cargando información...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {currentCoach ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Mi Coach
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">{currentCoach.full_name || currentCoach.email}</p>
                <p className="text-sm text-muted-foreground">{currentCoach.email}</p>
              </div>
              <Badge variant="default">Asignado</Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <CardTitle>Solicitar Coach</CardTitle>
              </div>
              <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Solicitar Coach
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Solicitar Asignación de Coach</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="coachEmail">Email del Coach</Label>
                      <Input
                        id="coachEmail"
                        type="email"
                        placeholder="coach@ejemplo.com"
                        value={coachEmail}
                        onChange={(e) => setCoachEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="message">Mensaje (opcional)</Label>
                      <Textarea
                        id="message"
                        placeholder="¿Por qué te gustaría trabajar con este coach?"
                        value={requestMessage}
                        onChange={(e) => setRequestMessage(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsRequestDialogOpen(false);
                          setCoachEmail('');
                          setRequestMessage('');
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        onClick={requestCoachAssignment}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No tienes un coach asignado</h3>
              <p className="text-muted-foreground mb-4">
                Solicita la asignación de un coach para comenzar tu plan nutricional
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de Solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {request.coach_name || 'Sin nombre'}
                    </TableCell>
                    <TableCell>{request.coach_email}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(request.status)} className="flex items-center gap-1 w-fit">
                        {getStatusIcon(request.status)}
                        {request.status === 'pending' ? 'Pendiente' : 
                         request.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(request.created_at).toLocaleDateString('es-ES')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientPanel;