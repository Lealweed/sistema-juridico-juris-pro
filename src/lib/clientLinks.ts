import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type ClientLinkRow = {
  id: string;
  office_id: string;
  from_client_id: string;
  to_client_id: string;
  relation_type: string;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

export async function listClientLinksByClient(clientId: string): Promise<ClientLinkRow[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('client_links')
    .select('id,office_id,from_client_id,to_client_id,relation_type,notes,created_by_user_id,created_at')
    .or(`from_client_id.eq.${clientId},to_client_id.eq.${clientId}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as any;
}

export async function createClientLink(args: {
  officeId: string;
  fromClientId: string;
  toClientId: string;
  relationType: string;
  notes?: string | null;
}) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb.from('client_links').insert({
    office_id: args.officeId,
    from_client_id: args.fromClientId,
    to_client_id: args.toClientId,
    relation_type: args.relationType,
    notes: args.notes ?? null,
    created_by_user_id: user.id,
  } as any);

  if (error) throw new Error(error.message);
}

export async function deleteClientLink(id: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error } = await sb.from('client_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
