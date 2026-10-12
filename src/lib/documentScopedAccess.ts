import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { captureTeamRequestIdentity } from '@/lib/teamRequestIdentityData';
import type { ClientLite } from '@/lib/types';

export type DocumentOfficeContext = { userId: string; officeId: string };
type RequestIdentity = Awaited<ReturnType<typeof captureTeamRequestIdentity>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readDocumentOffice(
  sb: SupabaseClient,
  identity: RequestIdentity,
  expected?: DocumentOfficeContext,
): Promise<DocumentOfficeContext> {
  await identity.assertCurrent();
  const query = sb.from('office_members').select('office_id,role')
    .eq('user_id', identity.userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await identity.bind(query);
  await identity.assertCurrent();
  if (error) throw new Error('Não foi possível confirmar o acesso aos documentos do escritório.');
  // Match the published app's primary-membership selection, without its cache,
  // profile-name shortcuts or stored-role fallback. Only real canonical roles qualify.
  if (!data || typeof data.office_id !== 'string' || !uuid.test(data.office_id)
    || (data.role !== 'admin' && data.role !== 'user')) {
    throw new Error('Sem permissão para gerar documentos neste escritório.');
  }
  const context = { userId: identity.userId, officeId: data.office_id };
  if (expected && (expected.userId !== context.userId || expected.officeId !== context.officeId)) {
    throw new Error('O acesso ao escritório mudou. Reabra o gerador de documentos.');
  }
  return context;
}

/** Tokens remain in the existing request-identity closure and never enter UI state. */
export async function getDocumentOfficeContext(expected?: DocumentOfficeContext): Promise<DocumentOfficeContext> {
  const sb = requireSupabase();
  const identity = await captureTeamRequestIdentity(sb.auth, getAuthedUser, expected?.userId);
  return readDocumentOffice(sb, identity, expected);
}

/** This loader belongs only to the document generator; global client loading is unchanged. */
export async function loadDocumentClients(expected: DocumentOfficeContext): Promise<ClientLite[]> {
  const sb = requireSupabase();
  const identity = await captureTeamRequestIdentity(sb.auth, getAuthedUser, expected.userId);
  const context = await readDocumentOffice(sb, identity, expected);
  const rows: ClientLite[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    await identity.assertCurrent();
    const query = sb.from('clients').select('id,name,phone,cpf,email,office_id')
      .eq('office_id', context.officeId).order('name', { ascending: true }).range(from, from + 999);
    const { data, error } = await identity.bind(query);
    await identity.assertCurrent();
    if (error) throw new Error('Não foi possível carregar os clientes autorizados para os documentos.');
    if (!Array.isArray(data)) throw new Error('A consulta de clientes retornou dados inválidos.');
    for (const row of data) {
      if (row.office_id !== context.officeId || typeof row.id !== 'string' || !uuid.test(row.id)
        || typeof row.name !== 'string' || !row.name.trim()) {
        throw new Error('A consulta de clientes não corresponde ao escritório confirmado.');
      }
      rows.push({ id: row.id, name: row.name, phone: row.phone, cpf: row.cpf, email: row.email });
    }
    if (data.length < 1000) break;
  }
  // Reject data collected while the account, primary office or membership changed.
  await readDocumentOffice(sb, identity, expected);
  return rows;
}
