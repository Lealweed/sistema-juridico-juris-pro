import { requireSupabase, getAuthedUser } from '@/lib/supabaseDb';

export async function createClientQuick({ name, officeId }: { name: string; officeId: string }): Promise<{ id: string; name: string }> {
  const sb = requireSupabase();
  await getAuthedUser();
  const { data, error } = await sb
    .from('clients')
    .insert({ name: name.trim(), office_id: officeId, phone: '' })
    .select('id, name')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar cliente');
  return data;
}
