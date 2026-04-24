import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import type { ClientLite } from '@/lib/types';

export async function loadClientsLite(): Promise<ClientLite[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const pageSize = 1000;
  const maxRows = 5000;
  const rows: ClientLite[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await sb
      .from('clients')
      .select('id,name,phone,cpf,email')
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const batch = (data || []) as ClientLite[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}
