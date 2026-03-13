import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card } from '@/ui/widgets/Card';
import { centsToBRL, type FinanceTx, listFinanceTx } from '@/lib/finance';

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return `${m}/${y}`;
}

function toDate(d: string) {
  // d is YYYY-MM-DD
  return new Date(d + 'T00:00:00');
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function FinanceCharts({ months = 6 }: { months?: number }) {
  const [rows, setRows] = useState<FinanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // We keep it simple: load recent tx and aggregate client-side.
        const data = await listFinanceTx(500);
        if (!alive) return;
        setRows(data);
        setLoading(false);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Falha ao carregar dados do financeiro.');
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { monthly, buckets, topCategories } = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(addMonths(now, -(months - 1)));

    const keys: string[] = [];
    for (let i = 0; i < months; i++) {
      keys.push(monthKey(addMonths(start, i)));
    }

    const map = new Map<string, { key: string; incomePaid: number; expensePaid: number }>();
    keys.forEach((k) => map.set(k, { key: k, incomePaid: 0, expensePaid: 0 }));

    const today = new Date();
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d7 = new Date(d0);
    d7.setDate(d0.getDate() + 7);
    const d30 = new Date(d0);
    d30.setDate(d0.getDate() + 30);

    const bucketsAcc = { dueToday: 0, due7: 0, due30: 0, plannedTotal: 0 };

    const catMap = new Map<string, { name: string; totalPaidCents: number }>();

    for (const r of rows) {
      // monthly paid
      if (r.status === 'paid') {
        const k = monthKey(toDate(r.occurred_on));
        const slot = map.get(k);
        if (slot) {
          if (r.type === 'income') slot.incomePaid += r.amount_cents;
          if (r.type === 'expense') slot.expensePaid += r.amount_cents;
        }

        // top categories (paid)
        const catName = r.category?.[0]?.name || 'Sem categoria';
        const bucket = catMap.get(catName) || { name: catName, totalPaidCents: 0 };
        bucket.totalPaidCents += r.amount_cents;
        catMap.set(catName, bucket);
      }

      // receivables buckets (planned income)
      if (r.type === 'income' && r.status === 'planned' && r.due_date) {
        bucketsAcc.plannedTotal += r.amount_cents;
        const due = toDate(r.due_date);
        if (due.getTime() <= d0.getTime()) bucketsAcc.dueToday += r.amount_cents;
        else if (due.getTime() <= d7.getTime()) bucketsAcc.due7 += r.amount_cents;
        else if (due.getTime() <= d30.getTime()) bucketsAcc.due30 += r.amount_cents;
      }
    }

    const monthlyArr = Array.from(map.values()).map((x) => ({
      name: monthLabel(x.key),
      incomePaid: Math.round(x.incomePaid / 100) / 100,
      expensePaid: Math.round(x.expensePaid / 100) / 100,
    }));

    const topCategories = Array.from(catMap.values())
      .sort((a, b) => b.totalPaidCents - a.totalPaidCents)
      .slice(0, 5)
      .map((c) => ({ name: c.name, totalPaid: Math.round((c.totalPaidCents / 100) * 100) / 100 }));

    return {
      monthly: monthlyArr,
      buckets: bucketsAcc,
      topCategories,
    };
  }, [rows, months]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Financeiro — últimos {months} meses</div>
            <div className="text-xs text-white/60">Receitas pagas vs despesas pagas</div>
          </div>
        </div>

        {loading ? <div className="mt-4 text-sm text-white/70">Carregando…</div> : null}
        {error ? <div className="mt-4 text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.55)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,10,0.9)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.8)' }}
                  formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, '']}
                />
                <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                <Bar name="Receitas pagas" dataKey="incomePaid" fill="rgba(212,175,55,0.85)" radius={[10, 10, 0, 0]} />
                <Bar name="Despesas pagas" dataKey="expensePaid" fill="rgba(255,255,255,0.18)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="text-sm font-semibold text-white">A receber (vencimentos)</div>
        <div className="text-xs text-white/60">Receitas previstas por faixa</div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Vence hoje/atrasado</div>
            <div className="mt-1 text-lg font-semibold text-white">{centsToBRL(buckets.dueToday)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Próximos 7 dias</div>
            <div className="mt-1 text-lg font-semibold text-white">{centsToBRL(buckets.due7)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Próximos 30 dias</div>
            <div className="mt-1 text-lg font-semibold text-white">{centsToBRL(buckets.due30)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Total previsto</div>
            <div className="mt-1 text-lg font-semibold text-white">{centsToBRL(buckets.plannedTotal)}</div>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <div className="text-sm font-semibold text-white">Top categorias (pagas)</div>
        <div className="text-xs text-white/60">Soma de lançamentos pagos por categoria</div>

        {loading ? <div className="mt-4 text-sm text-white/70">Carregando…</div> : null}
        {!loading && !error && topCategories.length === 0 ? (
          <div className="mt-4 text-sm text-white/60">Sem dados suficientes. Cadastre categorias no Financeiro.</div>
        ) : null}

        {!loading && !error && topCategories.length ? (
          <div className="mt-4 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategories} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.55)" fontSize={12} tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,10,0.9)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.8)' }}
                  formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'Total']}
                />
                <Bar dataKey="totalPaid" fill="rgba(212,175,55,0.85)" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
