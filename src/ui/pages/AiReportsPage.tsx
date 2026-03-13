import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/ui/widgets/Card';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type TaskLite = {
  id: string;
  status_v2: string | null;
  due_at: string | null;
  created_at: string | null;
  done_at: string | null;
  assigned_to_user_id: string | null;
};

type FinanceLite = {
  id: string;
  type: 'income' | 'expense' | string;
  amount_cents: number;
  paid_at: string | null;
  status: string | null;
};

type AgendaLite = {
  id: string;
  kind: 'deadline' | 'commitment' | string;
  title: string;
  starts_at: string | null;
  due_date: string | null;
};

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AiReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [finance, setFinance] = useState<FinanceLite[]>([]);
  const [agenda, setAgenda] = useState<AgendaLite[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const sb = requireSupabase();
        await getAuthedUser();

        const since7 = new Date(Date.now() - 7 * 86400e3).toISOString();
        const today = toDateKey(new Date());

        const [tRes, fRes, aRes] = await Promise.all([
          sb.from('tasks').select('id,status_v2,due_at,created_at,done_at,assigned_to_user_id').limit(1200),
          sb
            .from('finance_transactions')
            .select('id,type,amount_cents,status')
            .gte('created_at', since7)
            .limit(1200),
          sb
            .from('agenda_items')
            .select('id,kind,title,starts_at,due_date')
            .or(`and(kind.eq.deadline,due_date.gte.${today}),and(kind.eq.commitment,starts_at.gte.${new Date().toISOString()})`)
            .limit(1200),
        ]);

        if (tRes.error || fRes.error || aRes.error) {
          throw new Error(tRes.error?.message || fRes.error?.message || aRes.error?.message || 'Falha ao carregar relatórios.');
        }

        if (!active) return;
        setTasks((tRes.data || []) as TaskLite[]);
        setFinance((fRes.data || []) as FinanceLite[]);
        setAgenda((aRes.data || []) as AgendaLite[]);
        setLoading(false);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Falha ao carregar relatórios.');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const report = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400e3;

    const openTasks = tasks.filter((t) => !['done', 'cancelled'].includes((t.status_v2 || '').toLowerCase()));
    const created7d = tasks.filter((t) => (t.created_at ? new Date(t.created_at).getTime() >= sevenDaysAgo : false)).length;
    const done7d = tasks.filter((t) => (t.done_at ? new Date(t.done_at).getTime() >= sevenDaysAgo : false)).length;

    const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length;
    const due48 = openTasks.filter((t) => {
      if (!t.due_at) return false;
      const diff = new Date(t.due_at).getTime() - now;
      return diff >= 0 && diff <= 48 * 3600e3;
    }).length;

    const statusBucket = {
      open: tasks.filter((t) => (t.status_v2 || '').toLowerCase() === 'open').length,
      in_progress: tasks.filter((t) => (t.status_v2 || '').toLowerCase() === 'in_progress').length,
      paused: tasks.filter((t) => (t.status_v2 || '').toLowerCase() === 'paused').length,
      done: tasks.filter((t) => (t.status_v2 || '').toLowerCase() === 'done').length,
      cancelled: tasks.filter((t) => (t.status_v2 || '').toLowerCase() === 'cancelled').length,
    };

    const paid = finance.filter((f) => !!f.paid_at || (f.status || '').toLowerCase() === 'paid');
    const weekIncome = paid
      .filter((f) => f.type === 'income')
      .reduce((acc, f) => acc + Number(f.amount_cents || 0) / 100, 0);
    const weekExpense = paid
      .filter((f) => f.type === 'expense')
      .reduce((acc, f) => acc + Number(f.amount_cents || 0) / 100, 0);

    const upcomingAgenda = agenda
      .map((a) => ({
        ...a,
        ts:
          a.kind === 'deadline'
            ? new Date(`${a.due_date}T00:00:00`).getTime()
            : a.starts_at
              ? new Date(a.starts_at).getTime()
              : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 6);

    return {
      created7d,
      done7d,
      overdue,
      due48,
      weekIncome,
      weekExpense,
      net: weekIncome - weekExpense,
      statusBucket,
      upcomingAgenda,
    };
  }, [tasks, finance, agenda]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Relatórios internos</h1>
        <p className="text-sm text-white/60">Produtividade semanal, visão operacional e resumo executivo.</p>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wide text-white/60">Criadas (7d)</div>
          <div className="mt-2 text-2xl font-semibold text-white">{loading ? '—' : report.created7d}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-white/60">Concluídas (7d)</div>
          <div className="mt-2 text-2xl font-semibold text-white">{loading ? '—' : report.done7d}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-white/60">Atrasadas</div>
          <div className="mt-2 text-2xl font-semibold text-red-200">{loading ? '—' : report.overdue}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-white/60">Vencem em 48h</div>
          <div className="mt-2 text-2xl font-semibold text-amber-200">{loading ? '—' : report.due48}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-white">Distribuição operacional</div>
          {loading ? (
            <div className="mt-3 text-sm text-white/70">Carregando…</div>
          ) : (
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80"><span>Abertas</span><strong>{report.statusBucket.open}</strong></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80"><span>Em andamento</span><strong>{report.statusBucket.in_progress}</strong></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80"><span>Pausadas</span><strong>{report.statusBucket.paused}</strong></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80"><span>Concluídas</span><strong>{report.statusBucket.done}</strong></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80"><span>Canceladas</span><strong>{report.statusBucket.cancelled}</strong></div>
            </div>
          )}
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Resumo executivo (7 dias)</div>
          {loading ? (
            <div className="mt-3 text-sm text-white/70">Carregando…</div>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-white/80">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Receitas pagas: <strong>R$ {report.weekIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Despesas pagas: <strong>R$ {report.weekExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Saldo líquido: <strong className={report.net >= 0 ? 'text-emerald-300' : 'text-red-200'}>R$ {report.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="text-sm font-semibold text-white">Próximos compromissos e prazos</div>
        {loading ? (
          <div className="mt-3 text-sm text-white/70">Carregando…</div>
        ) : report.upcomingAgenda.length ? (
          <div className="mt-3 grid gap-2">
            {report.upcomingAgenda.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                <span className="font-semibold text-white">{a.title}</span>
                <span className="ml-2 badge">{a.kind === 'deadline' ? 'Prazo' : 'Compromisso'}</span>
                <div className="mt-1 text-xs text-white/60">
                  {a.kind === 'deadline' ? `Data: ${a.due_date || '—'}` : `Início: ${a.starts_at ? new Date(a.starts_at).toLocaleString() : '—'}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-white/60">Sem itens futuros no momento.</div>
        )}
      </Card>
    </div>
  );
}
