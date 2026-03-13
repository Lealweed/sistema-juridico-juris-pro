import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type CaseLite = {
  id: string;
  title: string;
  client_id: string | null;
  client?: { name: string }[] | null;
};

export async function loadCasesLite(): Promise<CaseLite[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('cases')
    .select('id,title,client_id, client:clients!cases_client_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);
  return (data || []) as any;
}
