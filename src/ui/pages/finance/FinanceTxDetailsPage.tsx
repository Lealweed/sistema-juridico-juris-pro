import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { brlToCents, centsToBRL, deleteFinanceTx, listFinanceTx, updateFinanceTx, type FinanceTx } from '@/lib/finance';
import { listPartners, type PartnerRow } from '@/lib/partners';
import { computeSplitAmountCents, createSplit, listSplitsByTx, type SplitRow } from '@/lib/splits';
import { getMyOfficeRole } from '@/lib/roles';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}


function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function FinanceTxDetailsPage() {
  const { txId } = useParams();
  const navigate = useNavigate();

  const [tx, setTx] = useState<FinanceTx | null>(null);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState('');

  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [partyId, setPartyId] = useState('');
  const [percent, setPercent] = useState('10');
  const [fixed, setFixed] = useState('100,00');
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [status, setStatus] = useState<'planned' | 'paid' | 'cancelled'>('planned');
  const [occurredOn, setOccurredOn] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [notes, setNotes] = useState('');

  async function load() {
    if (!txId) return;
    setLoading(true);
    setError(null);

    try {
      const [txs, s, p, role] = await Promise.all([
        listFinanceTx(500),
        listSplitsByTx(txId),
        listPartners(),
        getMyOfficeRole().catch(() => ''),
      ]);
      setTx(txs.find((x) => x.id === txId) || null);
      setSplits(s);
      setPartners(p);
      setMyRole(role || '');
      setLoading(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar.'));
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [txId]);

  useEffect(() => {
    if (!tx) return;
    setType(tx.type === 'expense' ? 'expense' : 'income');
    setStatus(
      tx.status === 'paid' || tx.status === 'cancelled'
        ? tx.status
        : 'planned',
    );
    setOccurredOn(tx.occurred_on || '');
    setDueDate(tx.due_date || '');
    setDescription(tx.description || '');
    setAmount((tx.amount_cents / 100).toFixed(2).replace('.', ','));
    setPaymentMethod(tx.payment_method || 'pix');
    setNotes(tx.notes || '');
  }, [tx]);

  const computed = useMemo(() => {
    if (!tx) return { total: 0 };
    return {
      total: splits.reduce((a, s) => a + computeSplitAmountCents(tx.amount_cents, s), 0),
    };
  }, [splits, tx]);

  const canManageTx = useMemo(() => {
    return myRole === 'admin' || myRole === 'owner';
  }, [myRole]);

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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao criar repasse.'));
      setSaving(false);
    }
  }

  async function onDeleteTx() {
    if (!txId || !tx || !canManageTx) return;
    if (!window.confirm('Deseja realmente excluir este lançamento financeiro?')) return;

    setSaving(true);
    setError(null);

    try {
      await deleteFinanceTx(txId);
      navigate('/app/financeiro');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao excluir lançamento.'));
      setSaving(false);
    }
  }

  async function onSaveTx() {
    if (!txId || !tx || !canManageTx) return;
    if (!description.trim()) {
      setError('Informe a descrição do lançamento.');
      return;
    }

    const cents = brlToCents(amount);
    if (cents === null || cents < 0) {
      setError('Valor inválido. Ex: 1500,00');
      return;
    }

    if (status === 'planned' && !dueDate) {
      setError('Informe o vencimento para lançamento previsto.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateFinanceTx(txId, {
        type,
        status,
        occurred_on: occurredOn,
        due_date: status === 'planned' ? dueDate : null,
        description: description.trim(),
        amount_cents: cents,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
      });
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao atualizar lançamento.'));
    } finally {
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
        <div className="flex flex-wrap gap-2">
          {canManageTx ? (
            <button disabled={saving} onClick={() => void onDeleteTx()} className="btn-ghost text-red-100 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-50">
              {saving ? 'Excluindo…' : 'Excluir lançamento'}
            </button>
          ) : null}
          <Link to="/app/financeiro" className="btn-ghost">
            Voltar
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && tx ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="grid gap-2">
              <div className="text-sm font-semibold text-white">{tx.description}</div>
              <div className="text-xs text-white/60">
                {tx.occurred_on}
                {tx.due_date ? ` · Venc.: ${tx.due_date}` : ''} · {tx.type} · {tx.status}
              </div>
              <div className="text-lg font-semibold text-white">{centsToBRL(tx.amount_cents)}</div>
            </div>
            {canManageTx ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
                Administradores e financeiro podem ajustar dados lançados pela equipe.
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {!loading && tx && canManageTx ? (
        <Card>
          <div className="text-sm font-semibold text-white">Editar lançamento</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-white/80">
              Tipo
              <select className="select" value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </label>

            <label className="text-sm text-white/80">
              Status
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'planned' | 'paid' | 'cancelled')}>
                <option value="planned">Previsto</option>
                <option value="paid">Pago</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>

            <label className="text-sm text-white/80">
              Data do lançamento
              <input type="date" className="input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </label>

            {status === 'planned' ? (
              <label className="text-sm text-white/80">
                Vencimento
                <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            ) : null}

            <label className={status === 'planned' ? 'md:col-span-2 text-sm text-white/80' : 'md:col-span-2 text-sm text-white/80'}>
              Descrição
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <label className="text-sm text-white/80">
              Valor (R$)
              <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500,00" />
            </label>

            <label className="text-sm text-white/80">
              Método
              <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="card">Cartão</option>
                <option value="transfer">Transferência</option>
              </select>
            </label>

            <label className="md:col-span-3 text-sm text-white/80">
              Observações
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={saving} onClick={() => void onSaveTx()} className="btn-primary">
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              disabled={saving}
              onClick={() => {
                if (!tx) return;
                setType(tx.type === 'expense' ? 'expense' : 'income');
                setStatus(tx.status === 'paid' || tx.status === 'cancelled' ? tx.status : 'planned');
                setOccurredOn(tx.occurred_on || '');
                setDueDate(tx.due_date || '');
                setDescription(tx.description || '');
                setAmount((tx.amount_cents / 100).toFixed(2).replace('.', ','));
                setPaymentMethod(tx.payment_method || 'pix');
                setNotes(tx.notes || '');
              }}
              className="btn-ghost"
            >
              Desfazer alterações
            </button>
          </div>
        </Card>
      ) : null}

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
            <button disabled={saving} onClick={() => void onCreateSplit()} className="btn-primary">
              {saving ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
