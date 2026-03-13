import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser } from '@/lib/supabaseDb';
import {
  brlToCents,
  centsToBRL,
  createFinanceTx,
  ensureCategory,
  listCategories,
  listFinanceTx,
  type FinanceCategory,
  type FinanceTx,
} from '@/lib/finance';


function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pdvStorageKey(date: string) {
  return `castrocrm.pdv.${date}`;
}

const FinanceChartsLazy = lazy(() => import('@/ui/widgets/FinanceCharts').then((m) => ({ default: m.FinanceCharts })));

export function FinancePage() {
  const [rows, setRows] = useState<FinanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [myRole, setMyRole] = useState<string>('');
  const [meId, setMeId] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [status, setStatus] = useState<'planned' | 'paid'>('planned');
  const [occurredOn, setOccurredOn] = useState(() => todayStr());
  const [dueDate, setDueDate] = useState(() => todayStr());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'paid'>('all');

  const [pdvOpen, setPdvOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [pdvAmount, setPdvAmount] = useState('');
  const [pdvDesc, setPdvDesc] = useState('');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [data, role, me] = await Promise.all([listFinanceTx(50), getMyOfficeRole().catch(() => ''), getAuthedUser()]);
      setMyRole(role || '');
      setMeId(me.id);
      setRows(data);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar financeiro.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = pdvStorageKey(todayStr());
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { open: boolean; openingCents?: number };
      setPdvOpen(Boolean(parsed.open));
      if (typeof parsed.openingCents === 'number') {
        setOpeningAmount((parsed.openingCents / 100).toFixed(2).replace('.', ','));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listCategories(type);
        if (!alive) return;
        setCategories(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [type]);

  const isAdmin = myRole === 'admin' || myRole === 'owner';
  const isFinance = myRole === 'finance';
  const isOperator = myRole === 'staff' || myRole === 'secretary' || myRole === 'assistant';
  const canSeeFullFinance = isAdmin || isFinance;

  const roleScopedRows = useMemo(() => {
    if (canSeeFullFinance) return rows;
    // advogado/member/staff só veem o que lançaram
    return rows.filter((r) => r.user_id === meId);
  }, [rows, canSeeFullFinance, meId]);

  const summary = useMemo(() => {
    const plannedIncome = roleScopedRows
      .filter((r) => r.type === 'income' && r.status === 'planned')
      .reduce((a, r) => a + r.amount_cents, 0);
    const plannedExpense = roleScopedRows
      .filter((r) => r.type === 'expense' && r.status === 'planned')
      .reduce((a, r) => a + r.amount_cents, 0);
    const paidIncome = roleScopedRows
      .filter((r) => r.type === 'income' && r.status === 'paid')
      .reduce((a, r) => a + r.amount_cents, 0);
    const paidExpense = roleScopedRows
      .filter((r) => r.type === 'expense' && r.status === 'paid')
      .reduce((a, r) => a + r.amount_cents, 0);
    const netPaid = paidIncome - paidExpense;
    return { plannedIncome, plannedExpense, paidIncome, paidExpense, netPaid };
  }, [roleScopedRows]);

  const filteredRows = useMemo(() => {
    let out = roleScopedRows;

    if (statusFilter !== 'all') {
      out = out.filter((r) => r.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => (r.description || '').toLowerCase().includes(q));
    }

    return out;
  }, [roleScopedRows, statusFilter, search]);

  const pdvSummary = useMemo(() => {
    const today = todayStr();
    const todayPaid = roleScopedRows.filter((r) => r.status === 'paid' && r.occurred_on === today);
    const inCents = todayPaid.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount_cents, 0);
    const outCents = todayPaid.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount_cents, 0);
    const openingCents = brlToCents(openingAmount) || 0;
    return {
      inCents,
      outCents,
      openingCents,
      balanceCents: openingCents + inCents - outCents,
    };
  }, [roleScopedRows, openingAmount]);

  async function onCreate() {
    if (!description.trim()) return;
    const cents = brlToCents(amount);
    if (cents === null) {
      setError('Valor inválido. Ex: 1500,00');
      return;
    }

    // For receivable/payable items, due_date drives reminders.
    const effectiveDueDate = status === 'planned' ? dueDate : null;

    if (status === 'planned' && !effectiveDueDate) {
      setError('Informe o vencimento.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let catId: string | null = categoryId || null;
      if (!catId && newCategoryName.trim()) {
        catId = await ensureCategory(type, newCategoryName.trim());
      }

      await createFinanceTx({
        type,
        status,
        occurred_on: occurredOn,
        due_date: effectiveDueDate,
        category_id: catId,
        description: description.trim(),
        amount_cents: cents,
        payment_method: paymentMethod,
        notes: notes.trim() || null,
      });

      setCreateOpen(false);
      setDescription('');
      setAmount('');
      setNotes('');
      setCategoryId('');
      setNewCategoryName('');
      setStatus('planned');
      setType('income');
      setPaymentMethod('pix');
      setOccurredOn(todayStr());
      setDueDate(todayStr());
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar lançamento.');
      setSaving(false);
    }
  }

  function openCash() {
    const cents = brlToCents(openingAmount);
    if (cents === null) {
      setError('Valor de abertura inválido. Ex: 200,00');
      return;
    }
    const key = pdvStorageKey(todayStr());
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify({ open: true, openingCents: cents }));
    }
    setPdvOpen(true);
  }

  function closeCash() {
    const key = pdvStorageKey(todayStr());
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        key,
        JSON.stringify({ open: false, openingCents: pdvSummary.openingCents, closedAt: new Date().toISOString() }),
      );
    }
    setPdvOpen(false);
  }

  async function quickPdv(typeValue: 'income' | 'expense') {
    const cents = brlToCents(pdvAmount);
    if (cents === null) {
      setError('Valor inválido. Ex: 150,00');
      return;
    }
    if (!pdvDesc.trim()) {
      setError('Informe a descrição da movimentação.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createFinanceTx({
        type: typeValue,
        status: 'paid',
        occurred_on: todayStr(),
        due_date: null,
        category_id: null,
        description: `[PDV] ${pdvDesc.trim()}`,
        amount_cents: cents,
        payment_method: 'pix',
        notes: 'Lançamento rápido de caixa',
      });
      setPdvAmount('');
      setPdvDesc('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha no lançamento rápido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(500px_180px_at_0%_0%,rgba(251,191,36,0.15),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">Castro de Oliveira Adv</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Financeiro executivo</h1>
            <p className="mt-1 text-sm text-white/60">
              Conciliação de receitas/despesas, previsões e visão operacional por status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
          {canSeeFullFinance ? (
            <>
              <Link to="/app/financeiro/parceiros" className="btn-ghost">
                Parceiros
              </Link>
              <Link to="/app/financeiro/a-pagar" className="btn-ghost">
                A pagar
              </Link>
            </>
          ) : null}
          {!isOperator ? (
            <button onClick={() => setCreateOpen(true)} className="btn-primary">
              Novo lançamento
            </button>
          ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card className="border-white/15 bg-gradient-to-b from-white/10 to-white/5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">PDV Jurídico (Caixa do Dia)</div>
            <div className="text-xs text-white/60">Abertura, movimentação rápida e fechamento de caixa.</div>
          </div>
          <div className="flex items-center gap-2">
            {!pdvOpen ? (
              <button className="btn-primary" onClick={openCash}>Abrir caixa</button>
            ) : (
              <button className="btn-ghost" onClick={closeCash}>Fechar caixa</button>
            )}
            <span className={`badge ${pdvOpen ? 'badge-gold' : ''}`}>{pdvOpen ? 'Caixa aberto' : 'Caixa fechado'}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm text-white/80">
            Abertura (R$)
            <input className="input" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="200,00" />
          </label>
          <label className="text-sm text-white/80 md:col-span-2">
            Descrição rápida
            <input className="input" value={pdvDesc} onChange={(e) => setPdvDesc(e.target.value)} placeholder="Consulta à vista, diligência..." />
          </label>
          <label className="text-sm text-white/80">
            Valor rápido (R$)
            <input className="input" value={pdvAmount} onChange={(e) => setPdvAmount(e.target.value)} placeholder="150,00" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button disabled={!pdvOpen || saving} onClick={() => void quickPdv('income')} className="btn-primary">Entrada rápida</button>
          <button disabled={!pdvOpen || saving} onClick={() => void quickPdv('expense')} className="btn-ghost">Saída rápida</button>
          <span className="badge">Entradas hoje: {centsToBRL(pdvSummary.inCents)}</span>
          <span className="badge">Saídas hoje: {centsToBRL(pdvSummary.outCents)}</span>
          <span className="badge border-emerald-400/30 bg-emerald-400/10 text-emerald-200">Saldo caixa: {centsToBRL(pdvSummary.balanceCents)}</span>
        </div>
      </Card>

      {!isOperator ? (
      <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Buscar lançamento</div>
          <input className="input !mt-1" placeholder="Ex.: honorário, custas..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Status</div>
          <select className="select !mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="planned">Previsto</option>
            <option value="paid">Pago</option>
          </select>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Saldo líquido (pago)</div>
          <div className={`mt-2 text-2xl font-semibold ${summary.netPaid >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>{centsToBRL(summary.netPaid)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-4 lg:grid-cols-4">

        <Card className="border-emerald-400/20 bg-gradient-to-b from-emerald-400/10 to-white/5">
          <div className="text-xs text-white/60">Receitas (pagas)</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-200">{centsToBRL(summary.paidIncome)}</div>
        </Card>
        <Card className="border-red-400/20 bg-gradient-to-b from-red-400/10 to-white/5">
          <div className="text-xs text-white/60">Despesas (pagas)</div>
          <div className="mt-2 text-2xl font-semibold text-red-200">{centsToBRL(summary.paidExpense)}</div>
        </Card>
        <Card className="border-white/15 bg-gradient-to-b from-white/10 to-white/5">
          <div className="text-xs text-white/60">A receber</div>
          <div className="mt-2 text-2xl font-semibold text-white">{centsToBRL(summary.plannedIncome)}</div>
        </Card>
        <Card className="border-white/15 bg-gradient-to-b from-white/10 to-white/5">
          <div className="text-xs text-white/60">A pagar</div>
          <div className="mt-2 text-2xl font-semibold text-white">{centsToBRL(summary.plannedExpense)}</div>
        </Card>
        </div>
        <button onClick={() => setShowCharts((v) => !v)} className="btn-ghost">
          {showCharts ? 'Ocultar gráficos' : 'Ver gráficos'}
        </button>
      </div>

      {showCharts ? (
        <Card>
          <div className="text-sm font-semibold text-white">Gráficos</div>
          <div className="mt-2 text-xs text-white/60">(Carrega mais pesado — recomendado no Wi‑Fi.)</div>
          <div className="mt-4">
            <Suspense fallback={<div className="text-sm text-white/70">Carregando gráficos…</div>}>
              <FinanceChartsLazy months={6} />
            </Suspense>
          </div>
        </Card>
      ) : null}

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Novo lançamento</div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-white/80">
                Tipo
                <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </label>
              <label className="text-sm text-white/80">
                Status
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="planned">Previsto</option>
                  <option value="paid">Pago</option>
                </select>
              </label>
              <label className="text-sm text-white/80">
                Data (lançamento)
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

              <label className="text-sm text-white/80">
                Categoria
                <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="md:col-span-2 text-sm text-white/80">
                Criar categoria (opcional)
                <input
                  className="input"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={type === 'income' ? 'Ex: Honorários' : 'Ex: Custas'}
                />
              </label>

              <label className="md:col-span-3 text-sm text-white/80">
                Observações
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={onCreate} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button disabled={saving} onClick={() => setCreateOpen(false)} className="btn-ghost">
                Cancelar
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="text-sm font-semibold text-white">Lançamentos</div>
        <div className="mt-3">
          {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
          {!loading && filteredRows.length === 0 ? <div className="text-sm text-white/60">Nenhum lançamento encontrado.</div> : null}

          <div className="mt-3 grid gap-2">
            {filteredRows.map((r) => (
              <Link key={r.id} to={`/app/financeiro/${r.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {r.description}{' '}
                      <span className={r.type === 'income' ? 'badge badge-gold' : 'badge'}>
                        {r.type === 'income' ? 'Receita' : 'Despesa'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      Lançamento: {r.occurred_on}
                      {r.due_date ? ` · Venc.: ${r.due_date}` : ''} ·{' '}
                      {r.status === 'paid' ? 'Pago' : r.status === 'planned' ? 'Previsto' : r.status}
                      {r.payment_method ? ` · ${r.payment_method}` : ''}
                      {r.reminder_1d_sent_at ? ' · Aviso 1d: enviado' : ''}
                    </div>
                    {r.notes ? <div className="mt-1 text-xs text-white/50">Obs: {r.notes}</div> : null}
                  </div>
                  <div className="text-sm font-semibold text-white">{centsToBRL(r.amount_cents)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Card>
      </>
      ) : (
        <Card>
          <div className="text-sm font-semibold text-white">Acesso operacional</div>
          <div className="mt-2 text-sm text-white/70">
            Seu perfil de Operador acessa somente o PDV para lançamentos rápidos de caixa.
          </div>
        </Card>
      )}
    </div>
  );
}
