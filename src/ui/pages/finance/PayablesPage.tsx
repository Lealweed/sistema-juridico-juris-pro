import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { centsToBRL, listFinanceTx, type FinanceTx } from '@/lib/finance';
import { computeSplitAmountCents, listPendingSplits, markSplitPaid, type SplitRow } from '@/lib/splits';

type Row = SplitRow & { tx?: FinanceTx | null; amountCents: number; partnerName: string };

export function PayablesPage() {
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [txs, setTxs] = useState<FinanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([listPendingSplits(), listFinanceTx(500)]);
      setSplits(s);
      setTxs(t);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar repasses.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const txMap = new Map(txs.map((t) => [t.id, t] as const));
    return splits.map((s) => {
      const tx = txMap.get(s.transaction_id) || null;
      const amountCents = tx ? computeSplitAmountCents(tx.amount_cents, s) : computeSplitAmountCents(0, s);
      const partnerName = s.party?.[0]?.name || 'Parceiro';
      return { ...s, tx, amountCents, partnerName };
    });
  }, [splits, txs]);

  const total = useMemo(() => rows.reduce((a, r) => a + r.amountCents, 0), [rows]);

  async function onMarkPaid(id: string) {
    try {
      await markSplitPaid(id);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao marcar como pago.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">A pagar parceiros</h1>
          <p className="text-sm text-white/60">Repasses pendentes (splits) por lançamento.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold text-white">Total: {centsToBRL(total)}</div>
          <Link to="/app/financeiro" className="btn-ghost">
            Voltar
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && rows.length === 0 ? <div className="text-sm text-white/60">Nenhum repasse pendente.</div> : null}

        {!loading && rows.length ? (
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{r.partnerName}</div>
                    <div className="mt-1 text-xs text-white/60">
                      {r.kind === 'fixed' ? 'Fixo' : `${r.value}%`} · Lançamento:{' '}
                      {r.tx ? (
                        <Link className="link-accent" to={`/app/financeiro/${r.tx.id}`}>
                          {r.tx.description}
                        </Link>
                      ) : (
                        r.transaction_id
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{centsToBRL(r.amountCents)}</div>
                    <button
                      onClick={() => void onMarkPaid(r.id)}
                      className="btn-primary !mt-2 !rounded-lg !px-3 !py-1.5 !text-xs"
                    >
                      Marcar pago
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
