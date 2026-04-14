import { requireSupabase, getAuthedUser } from '@/lib/supabaseDb';

export async function createClientQuick({ name, officeId }: { name: string; officeId: string }): Promise<{ id: string; name: string; phone?: string | null; cpf?: string | null }> {
  const sb = requireSupabase();
  await getAuthedUser();
  const { data, error } = await sb
    .from('clients')
    .insert({ name: name.trim(), office_id: officeId, phone: '' })
    .select('id, name, phone, cpf')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar cliente');
  return data;
}
