import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type PartnerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  kind: string;
  created_at: string;
};

export async function listPartners(): Promise<PartnerRow[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('finance_parties')
    .select('id,name,phone,email,kind,created_at')
    .eq('kind', 'external')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as PartnerRow[];
}

export async function createPartner(payload: { name: string; phone?: string | null; email?: string | null }) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb.from('finance_parties').insert({
    user_id: user.id,
    kind: 'external',
    name: payload.name.trim(),
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
  } as any);

  if (error) throw new Error(error.message);
}

export async function deletePartner(id: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error } = await sb.from('finance_parties').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
