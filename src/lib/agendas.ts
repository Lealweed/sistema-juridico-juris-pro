import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type AgendaRow = {
  id: string;
  office_id: string;
  name: string;
  color: string;
  kind: string;
  owner_user_id: string | null;
  is_default: boolean;
  created_at: string;
};

export async function listAgendas() {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('agendas')
    .select('id,office_id,name,color,kind,owner_user_id,is_default,created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data || []) as AgendaRow[];
}

export async function createAgenda(args: { officeId: string; name: string; color: string; kind?: string }) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb.from('agendas').insert({
    office_id: args.officeId,
    name: args.name.trim(),
    color: args.color,
    kind: args.kind || 'shared',
    owner_user_id: args.kind === 'personal' ? user.id : null,
    is_default: false,
  } as any);

  if (error) throw new Error(error.message);
  return { ok: true };
}
