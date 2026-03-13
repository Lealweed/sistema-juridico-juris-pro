import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type FinanceCategory = {
  id: string;
  type: 'income' | 'expense' | string;
  name: string;
};

export type FinanceTx = {
  id: string;
  user_id: string;
  type: 'income' | 'expense' | string;
  status: 'planned' | 'paid' | 'cancelled' | string;
  occurred_on: string;
  due_date: string | null;
  description: string;
  amount_cents: number;
  payment_method: string | null;
  notes: string | null;
  reminder_1d_sent_at: string | null;
  category_id: string | null;
  category?: { name: string }[] | null;
  created_at: string;
};

export function centsToBRL(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function brlToCents(input: string) {
  // accepts "1234,56" or "1234.56" or "R$ 1.234,56"
  const cleaned = input.replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const normalized = cleaned.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function listFinanceTx(limit = 50): Promise<FinanceTx[]> {
  const sb = requireSupabase();
  await getAuthedUser();
  const { data, error } = await sb
    .from('finance_transactions')
    .select(
      'id,user_id,type,status,occurred_on,due_date,description,amount_cents,payment_method,notes,reminder_1d_sent_at,category_id,category:finance_categories(name),created_at',
    )
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as FinanceTx[];
}

export async function listCategories(type: 'income' | 'expense'): Promise<FinanceCategory[]> {
  const sb = requireSupabase();
  await getAuthedUser();
  const { data, error } = await sb
    .from('finance_categories')
    .select('id,type,name')
    .eq('type', type)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []) as FinanceCategory[];
}

export async function ensureCategory(type: 'income' | 'expense', name: string): Promise<string> {
  const sb = requireSupabase();
  const user = await getAuthedUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Categoria inválida.');

  const { data, error } = await sb
    .from('finance_categories')
    .upsert({ user_id: user.id, type, name: trimmed } as any, {
      onConflict: 'user_id,type,name',
    })
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Falha ao criar categoria.');
  return data.id as string;
}

export async function createFinanceTx(payload: {
  type: 'income' | 'expense';
  status: 'planned' | 'paid';
  occurred_on: string;
  due_date?: string | null;
  category_id?: string | null;
  description: string;
  amount_cents: number;
  payment_method?: string | null;
  notes?: string | null;
}) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb.from('finance_transactions').insert({
    user_id: user.id,
    ...payload,
    due_date: payload.due_date || null,
    category_id: payload.category_id || null,
    payment_method: payload.payment_method || null,
    notes: payload.notes || null,
  });

  if (error) throw new Error(error.message);
}
