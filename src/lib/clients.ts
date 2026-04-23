import { requireSupabase, getAuthedUser } from '@/lib/supabaseDb';

export async function createClientQuick({ name, officeId }: { name: string; officeId: string }): Promise<{ id: string; name: string; phone?: string | null; cpf?: string | null }> {
  const sb = requireSupabase();
  await getAuthedUser();
  const { data, error } = await sb
    .from('clients')
    .insert({ name: name.trim(), office_id: officeId, phone: '', contact_type: 'client' })
    .select('id, name, phone, cpf')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Erro ao criar cliente');
  return data;
}

/**
 * Converte um lead em cliente confirmado.
 * Atualiza contact_type para 'client' e registra no audit (best-effort).
 */
export async function convertLeadToClient(clientId: string): Promise<void> {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb
    .from('clients')
    .update({ contact_type: 'client' })
    .eq('id', clientId);

  if (error) throw new Error(error.message);

  // Registra conversão no audit (best-effort: não bloqueia em caso de falha)
  try {
    await sb.from('audit_logs').insert({
      action: 'convert_lead_to_client',
      table_name: 'clients',
      record_id: clientId,
      client_id: clientId,
      user_id: user.id,
      before_data: { contact_type: 'lead' },
      after_data: { contact_type: 'client' },
    });
  } catch {
    // audit é best-effort
  }
}
