import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type SplitRow = {
  id: string;
  transaction_id: string;
  party_id: string;
  kind: 'percent' | 'fixed' | string;
  value: number;
  amount_cents_override: number | null;
  status: 'pending' | 'paid' | string;
  paid_at: string | null;
  created_at: string;
  party?: { name: string }[] | null;
};

export function computeSplitAmountCents(txAmountCents: number, s: Pick<SplitRow, 'kind' | 'value' | 'amount_cents_override'>) {
  if (s.kind === 'fixed') return Math.max(0, s.amount_cents_override || 0);
  // percent
  const pct = Number(s.value) || 0;
  return Math.max(0, Math.round((txAmountCents * pct) / 100));
}

export async function listSplitsByTx(txId: string): Promise<SplitRow[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('finance_splits')
    .select('id,transaction_id,party_id,kind,value,amount_cents_override,status,paid_at,created_at,party:finance_parties(name)')
    .eq('transaction_id', txId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as any;
}

export async function createSplit(payload: {
  transaction_id: string;
  party_id: string;
  kind: 'percent' | 'fixed';
  value: number;
  amount_cents_override?: number | null;
}) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb.from('finance_splits').insert({
    user_id: user.id,
    transaction_id: payload.transaction_id,
    party_id: payload.party_id,
    kind: payload.kind,
    value: payload.value,
    amount_cents_override: payload.kind === 'fixed' ? payload.amount_cents_override || 0 : null,
    status: 'pending',
  } as any);

  if (error) throw new Error(error.message);
}

export async function markSplitPaid(splitId: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error } = await sb
    .from('finance_splits')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', splitId);

  if (error) throw new Error(error.message);
}

export async function listPendingSplits(): Promise<SplitRow[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('finance_splits')
    .select('id,transaction_id,party_id,kind,value,amount_cents_override,status,paid_at,created_at,party:finance_parties(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []) as any;
}
