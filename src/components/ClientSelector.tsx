import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/hooks/useAuth';

interface Client {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
}

interface ClientSelectorProps {
  profile: Profile;
  selectedClientId: string | null;
  onClientChange: (clientId: string | null) => void;
}

const ClientSelector = ({ profile, selectedClientId, onClientChange }: ClientSelectorProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile.role === 'coach') {
      fetchCoachClients();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const fetchCoachClients = async () => {
    try {
      console.log('Fetching clients for coach:', profile.id);
      
      // Get assigned clients with manual join
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('clients_coaches')
        .select('client_id')
        .eq('coach_id', profile.id);

      console.log('Assignment data (ClientSelector):', assignmentData);
      if (assignmentError) throw assignmentError;

      if (!assignmentData || assignmentData.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      // Get client profiles separately
      const clientIds = assignmentData.map(assignment => assignment.client_id);
      const { data: clientProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name')
        .in('id', clientIds);

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
          full_name: profile.full_name
        };
      }).filter(Boolean);

      setClients(clientsData);

      // If no client is selected and there are clients, select the first one
      if (!selectedClientId && clientsData.length > 0) {
        onClientChange(clientsData[0].id);
      }
    } catch (error) {
      console.error('Error fetching coach clients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show selector for non-coach users
  if (profile.role !== 'coach') {
    return null;
  }

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Cargando clientes...</div>
        </CardContent>
      </Card>
    );
  }

  if (clients.length === 0) {
    return (
      <Card className="mb-4 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="text-sm">No tienes clientes asignados. Ve a Administración para asignar clientes.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <User className="w-4 h-4" />
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Cliente Actual:</label>
            <Select value={selectedClientId || ''} onValueChange={onClientChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un cliente" />
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
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientSelector;