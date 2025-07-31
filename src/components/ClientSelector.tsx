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
      const { data: assignedClients, error } = await supabase
        .from('clients_coaches')
        .select(`
          client_id,
          profiles!clients_coaches_client_id_fkey (
            id,
            user_id,
            email,
            full_name
          )
        `)
        .eq('coach_id', profile.id);

      if (error) throw error;

      const clientsData = assignedClients?.map(assignment => ({
        id: assignment.profiles.id,
        user_id: assignment.profiles.user_id,
        email: assignment.profiles.email,
        full_name: assignment.profiles.full_name
      })) || [];

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