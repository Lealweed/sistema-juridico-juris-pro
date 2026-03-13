import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import type { ClientLite } from '@/lib/types';

export async function loadClientsLite(): Promise<ClientLite[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb.from('clients').select('id,name').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ClientLite[];
}
