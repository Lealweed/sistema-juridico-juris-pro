import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listPartners, type PartnerRow } from '@/lib/partners';
import { Card } from '@/ui/widgets/Card';
import { centsToBRL, listFinanceTx, type FinanceTx } from '@/lib/finance';
import { brlToCents } from '@/lib/finance';
import { computeSplitAmountCents, deleteSplit, listSplits, markSplitPaid, markSplitPending, updateSplit, type SplitRow } from '@/lib/splits';

type Row = SplitRow & { tx?: FinanceTx | null; amountCents: number; partnerName: string };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PayablesPage() {
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [txs, setTxs] = useState<FinanceTx[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [partyId, setPartyId] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [percent, setPercent] = useState('10');
  const [fixed, setFixed] = useState('100,00');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, t, p] = await Promise.all([listSplits(statusFilter), listFinanceTx(500), listPartners()]);
      setSplits(s);
      setTxs(t);
      setPartners(p);
      setLoading(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar repasses.'));
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

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

  function startEdit(row: Row) {
    setEditingId(row.id);
    setPartyId(row.party_id);
    setKind(row.kind === 'fixed' ? 'fixed' : 'percent');
    setPercent(String(row.value || 0));
    setFixed(((row.amount_cents_override || 0) / 100).toFixed(2).replace('.', ','));
  }

  function resetEdit() {
    setEditingId(null);
    setPartyId('');
    setKind('percent');
    setPercent('10');
    setFixed('100,00');
  }

  async function onMarkPaid(id: string) {
    setSavingId(id);
    try {
      await markSplitPaid(id);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao marcar como pago.'));
    } finally {
      setSavingId(null);
    }
  }

  async function onUndoPaid(id: string) {
    setSavingId(id);
    try {
      await markSplitPending(id);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao desfazer pagamento.'));
    } finally {
      setSavingId(null);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Excluir repasse?')) return;
    setSavingId(id);
    try {
      await deleteSplit(id);
      if (editingId === id) resetEdit();
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao excluir repasse.'));
    } finally {
      setSavingId(null);
    }
  }

  async function onSaveEdit(id: string) {
    if (!partyId) {
      setError('Selecione um parceiro.');
      return;
    }

    setSavingId(id);
    setError(null);

    try {
      if (kind === 'percent') {
        const value = Number(percent);
        if (!Number.isFinite(value) || value <= 0) throw new Error('Percentual inválido.');
        await updateSplit(id, { party_id: partyId, kind: 'percent', value, amount_cents_override: null });
      } else {
        const amountCents = brlToCents(fixed);
        if (amountCents === null || amountCents <= 0) throw new Error('Valor fixo inválido.');
        await updateSplit(id, { party_id: partyId, kind: 'fixed', value: 0, amount_cents_override: amountCents });
      }
      resetEdit();
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao atualizar repasse.'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">A pagar parceiros</h1>
          <p className="text-sm text-white/60">Repasses por lançamento com edição, exclusão e desfazer pagamento.</p>
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Status:</span>
          <button onClick={() => setStatusFilter('all')} className={`btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs ${statusFilter === 'all' ? '!border-amber-300/30 !bg-amber-400/10 text-amber-100' : ''}`}>
            Todos
          </button>
          <button onClick={() => setStatusFilter('pending')} className={`btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs ${statusFilter === 'pending' ? '!border-amber-300/30 !bg-amber-400/10 text-amber-100' : ''}`}>
            Pendentes
          </button>
          <button onClick={() => setStatusFilter('paid')} className={`btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs ${statusFilter === 'paid' ? '!border-amber-300/30 !bg-amber-400/10 text-amber-100' : ''}`}>
            Pagos
          </button>
        </div>

        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && rows.length === 0 ? <div className="text-sm text-white/60">Nenhum repasse encontrado.</div> : null}

        {!loading && rows.length ? (
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{r.partnerName}</div>
                    <div className="mt-1 text-xs text-white/60">
                      {r.kind === 'fixed' ? 'Fixo' : `${r.value}%`} · Status: {r.status} · Lançamento:{' '}
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
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button
                        onClick={() => startEdit(r)}
                        className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                        disabled={savingId === r.id}
                      >
                        Editar
                      </button>
                      {r.status === 'pending' ? (
                        <button
                          onClick={() => void onMarkPaid(r.id)}
                          className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs"
                          disabled={savingId === r.id}
                        >
                          {savingId === r.id ? 'Salvando…' : 'Marcar pago'}
                        </button>
                      ) : (
                        <button
                          onClick={() => void onUndoPaid(r.id)}
                          className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                          disabled={savingId === r.id}
                        >
                          {savingId === r.id ? 'Salvando…' : 'Desfazer'}
                        </button>
                      )}
                      <button
                        onClick={() => void onDelete(r.id)}
                        className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                        disabled={savingId === r.id}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>

                {editingId === r.id ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="grid gap-3 md:grid-cols-3">
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
                        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}>
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
                      <button
                        onClick={() => void onSaveEdit(r.id)}
                        className="btn-primary"
                        disabled={savingId === r.id}
                      >
                        {savingId === r.id ? 'Salvando…' : 'Salvar alterações'}
                      </button>
                      <button onClick={resetEdit} className="btn-ghost" disabled={savingId === r.id}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
