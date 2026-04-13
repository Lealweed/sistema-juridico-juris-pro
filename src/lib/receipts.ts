import { getMyOfficeId } from '@/lib/officeContext';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type Receipt = {
  id: string;
  office_id: string;
  client_id: string;
  created_by: string;
  amount: number;
  description: string | null;
  status: string;
  issued_at: string;
  pdf_url: string | null;
  created_at: string;
  client?: { name: string } | null;
};

export async function listReceipts(limit = 100): Promise<Receipt[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('receipts')
    .select('id,office_id,client_id,created_by,amount,description,status,issued_at,pdf_url,created_at,client:clients(name)')
    .order('issued_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data) return [];
  // Tipagem segura: converte cada item explicitamente
  return data.map((r: any) => ({
    id: r.id,
    office_id: r.office_id,
    client_id: r.client_id,
    created_by: r.created_by,
    amount: r.amount,
    description: r.description,
    status: r.status,
    issued_at: r.issued_at,
    pdf_url: r.pdf_url,
    created_at: r.created_at,
    client: r.client && Array.isArray(r.client) && r.client.length > 0 ? { name: String(r.client[0].name) } : null,
  }));
}

export async function createReceiptSecure(input: {
  clientId: string;
  amount: number;
  description?: string | null;
  status?: string;
  issuedAt?: string;
  pdfUrl?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  await getAuthedUser();
  const officeId = await getMyOfficeId();

  if (!officeId) throw new Error('Escritório não encontrado para o usuário atual.');

  const { data, error } = await sb.rpc('create_receipt_secure', {
    p_office_id: officeId,
    p_client_id: input.clientId,
    p_amount: input.amount,
    p_description: input.description || null,
    p_status: input.status || 'emitido',
    p_issued_at: input.issuedAt || null,
    p_pdf_url: input.pdfUrl || null,
  });

  if (error) throw new Error(error.message);
  return String(data || '');
}

export async function updateReceiptStatusPdf(input: { id: string; status?: string; pdfUrl?: string | null }) {
  const sb = requireSupabase();
  await getAuthedUser();

  const patch: Record<string, string | null> = {};
  if (typeof input.status === 'string') patch.status = input.status;
  if (input.pdfUrl !== undefined) patch.pdf_url = input.pdfUrl;

  const { error } = await sb.from('receipts').update(patch).eq('id', input.id);
  if (error) throw new Error(error.message);
}
