import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { centsToBRL, listFinanceTx, type FinanceTx } from '@/lib/finance';
import { listPartners, type PartnerRow } from '@/lib/partners';
import { brlToCents } from '@/lib/finance';
import { computeSplitAmountCents, createSplit, listSplitsByTx, type SplitRow } from '@/lib/splits';

export function FinanceTxDetailsPage() {
  const { txId } = useParams();

  const [tx, setTx] = useState<FinanceTx | null>(null);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [partyId, setPartyId] = useState('');
  const [percent, setPercent] = useState('10');
  const [fixed, setFixed] = useState('100,00');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!txId) return;
    setLoading(true);
    setError(null);

    try {
      const [txs, s, p] = await Promise.all([listFinanceTx(500), listSplitsByTx(txId), listPartners()]);
      setTx(txs.find((x) => x.id === txId) || null);
      setSplits(s);
      setPartners(p);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [txId]);

  const computed = useMemo(() => {
    if (!tx) return { total: 0 };
    return {
      total: splits.reduce((a, s) => a + computeSplitAmountCents(tx.amount_cents, s), 0),
    };
  }, [splits, tx]);

  async function onCreateSplit() {
    if (!txId) return;
    if (!partyId) {
      setError('Selecione um parceiro.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (kind === 'percent') {
        const v = Number(percent);
        if (!Number.isFinite(v) || v <= 0) throw new Error('Percentual inválido.');
        await createSplit({ transaction_id: txId, party_id: partyId, kind: 'percent', value: v });
      } else {
        const cents = brlToCents(fixed);
        if (cents === null || cents <= 0) throw new Error('Valor fixo inválido.');
        await createSplit({
          transaction_id: txId,
          party_id: partyId,
          kind: 'fixed',
          value: 0,
          amount_cents_override: cents,
        });
      }

      setPartyId('');
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar repasse.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lançamento</h1>
          <p className="text-sm text-white/60">Dividir com parceiros (% ou fixo)</p>
        </div>
        <Link to="/app/financeiro" className="btn-ghost">
          Voltar
        </Link>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && tx ? (
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-white">{tx.description}</div>
            <div className="text-xs text-white/60">
              {tx.occurred_on}
              {tx.due_date ? ` · Venc.: ${tx.due_date}` : ''} · {tx.type} · {tx.status}
            </div>
            <div className="text-lg font-semibold text-white">{centsToBRL(tx.amount_cents)}</div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Repasses</div>
            <div className="text-xs text-white/60">Total repassado: {centsToBRL(computed.total)}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {splits.length === 0 ? <div className="text-sm text-white/60">Nenhum repasse criado.</div> : null}
          {tx
            ? splits.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{s.party?.[0]?.name || 'Parceiro'}</div>
                      <div className="mt-1 text-xs text-white/60">
                        {s.kind === 'fixed' ? 'Fixo' : `${s.value}%`} · Status: {s.status}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white">{centsToBRL(computeSplitAmountCents(tx.amount_cents, s))}</div>
                  </div>
                </div>
              ))
            : null}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white">Adicionar repasse</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-white/80">
              Parceiro
              <select className="select" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">Selecione…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-white/80">
              Tipo
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                <option value="percent">Percentual</option>
                <option value="fixed">Fixo</option>
              </select>
            </label>

            {kind === 'percent' ? (
              <label className="text-sm text-white/80">
                Percentual (%)
                <input className="input" value={percent} onChange={(e) => setPercent(e.target.value)} />
              </label>
            ) : (
              <label className="text-sm text-white/80">
                Valor fixo (R$)
                <input className="input" value={fixed} onChange={(e) => setFixed(e.target.value)} />
              </label>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={saving} onClick={() => void onCreateSplit()} className="btn-primary">
              {saving ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
