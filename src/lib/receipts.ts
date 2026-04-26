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

type ReceiptQueryRow = Partial<Omit<Receipt, 'client'>> & {
  client?: Array<{ name?: string | null; cpf?: string | null }> | { name?: string | null; cpf?: string | null } | null;
};

function normalizeReceiptClient(client: ReceiptQueryRow['client']): Receipt['client'] {
  const row = Array.isArray(client) ? client[0] : client;
  return row?.name ? { name: String(row.name), cpf: row.cpf ?? null } : null;
}

export async function listReceipts(limit = 100): Promise<Receipt[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const selectWithHonorarios =
    'id,office_id,client_id,created_by,amount,description,status,issued_at,pdf_url,created_at,payment_method,city,lawyer_name,lawyer_oab,amount_written,client:clients(name,cpf)';
  const selectBase =
    'id,office_id,client_id,created_by,amount,description,status,issued_at,pdf_url,created_at,client:clients(name,cpf)';

  let data: ReceiptQueryRow[] | null = null;
  let error: { message: string } | null = null;

  ({ data, error } = await sb
    .from('receipts')
    .select(selectWithHonorarios)
    .order('issued_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit));

  const missingHonorariosColumn = Boolean(error?.message && /column\s+receipts\.(payment_method|city|lawyer_name|lawyer_oab|amount_written)\s+does not exist/i.test(error.message));

  if (missingHonorariosColumn) {
    ({ data, error } = await sb
      .from('receipts')
      .select(selectBase)
      .order('issued_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit));
  }

  if (error) throw new Error(error.message);
  if (!data) return [];
  // Tipagem segura: converte cada item explicitamente
  return data.map((r) => ({
    id: String(r.id),
    office_id: String(r.office_id),
    client_id: String(r.client_id),
    created_by: String(r.created_by),
    amount: Number(r.amount || 0),
    description: r.description ?? null,
    status: String(r.status),
    issued_at: String(r.issued_at),
    pdf_url: r.pdf_url ?? null,
    created_at: String(r.created_at),
    payment_method: r.payment_method ?? null,
    city: r.city ?? null,
    lawyer_name: r.lawyer_name ?? null,
    lawyer_oab: r.lawyer_oab ?? null,
    amount_written: r.amount_written ?? null,
    client: normalizeReceiptClient(r.client),
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


export async function updateReceiptSecure(input: {
  id: string;
  clientId?: string;
  amount?: number;
  description?: string | null;
  status?: string;
  issuedAt?: string;
  paymentMethod?: string | null;
  city?: string | null;
  lawyerName?: string | null;
  lawyerOab?: string | null;
  amountWritten?: string | null;
}) {
  const sb = requireSupabase();
  await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) throw new Error('Escritório não encontrado para o usuário atual.');

  const patch: Record<string, unknown> = {};
  if (input.clientId !== undefined) patch.client_id = input.clientId;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.issuedAt !== undefined) patch.issued_at = input.issuedAt;
  if (input.paymentMethod !== undefined) patch.payment_method = input.paymentMethod ?? null;
  if (input.city !== undefined) patch.city = input.city ?? null;
  if (input.lawyerName !== undefined) patch.lawyer_name = input.lawyerName ?? null;
  if (input.lawyerOab !== undefined) patch.lawyer_oab = input.lawyerOab ?? null;
  if (input.amountWritten !== undefined) patch.amount_written = input.amountWritten ?? null;

  const { error } = await sb
    .from('receipts')
    .update(patch)
    .eq('id', input.id)
    .eq('office_id', officeId);

  if (error) throw new Error(error.message);
}

export async function deleteReceiptSecure(id: string) {
  const sb = requireSupabase();
  await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) throw new Error('Escritório não encontrado para o usuário atual.');

  const { error } = await sb
    .from('receipts')
    .delete()
    .eq('id', id)
    .eq('office_id', officeId);

  if (error) throw new Error(error.message);
}
