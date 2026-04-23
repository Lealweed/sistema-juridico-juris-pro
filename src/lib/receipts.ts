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
  payment_method: string | null;
  city: string | null;
  lawyer_name: string | null;
  lawyer_oab: string | null;
  amount_written: string | null;
  client?: { name: string; cpf?: string | null } | null;
};

export async function listReceipts(limit = 100): Promise<Receipt[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('receipts')
    .select('id,office_id,client_id,created_by,amount,description,status,issued_at,pdf_url,created_at,payment_method,city,lawyer_name,lawyer_oab,amount_written,client:clients(name,cpf)')
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
    payment_method: r.payment_method ?? null,
    city: r.city ?? null,
    lawyer_name: r.lawyer_name ?? null,
    lawyer_oab: r.lawyer_oab ?? null,
    amount_written: r.amount_written ?? null,
    client: r.client && Array.isArray(r.client) && r.client.length > 0
      ? { name: String(r.client[0].name), cpf: r.client[0].cpf ?? null }
      : null,
  }));
}

export async function createReceiptSecure(input: {
  clientId: string;
  amount: number;
  description?: string | null;
  status?: string;
  issuedAt?: string;
  pdfUrl?: string | null;
  paymentMethod?: string | null;
  city?: string | null;
  lawyerName?: string | null;
  lawyerOab?: string | null;
  amountWritten?: string | null;
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
  const receiptId = String(data || '');

  // Persist extra fields that are not in the RPC signature
  const extras: Record<string, string | null> = {};
  if (input.paymentMethod !== undefined) extras.payment_method = input.paymentMethod ?? null;
  if (input.city !== undefined) extras.city = input.city ?? null;
  if (input.lawyerName !== undefined) extras.lawyer_name = input.lawyerName ?? null;
  if (input.lawyerOab !== undefined) extras.lawyer_oab = input.lawyerOab ?? null;
  if (input.amountWritten !== undefined) extras.amount_written = input.amountWritten ?? null;

  if (Object.keys(extras).length > 0) {
    const { error: extErr } = await sb.from('receipts').update(extras).eq('id', receiptId);
    if (extErr) console.warn('Extras update failed:', extErr.message);
  }

  return receiptId;
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
