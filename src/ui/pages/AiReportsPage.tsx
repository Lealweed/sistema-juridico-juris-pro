import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/ui/widgets/Card';
import { sendWhatsAppText } from '@/lib/evolutionApi';
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

type CaseCreatedLite = {
  id: string;
  created_at: string | null;
};

type AgendaLite = {
  id: string;
  kind: 'deadline' | 'commitment' | string;
  title: string;
  starts_at: string | null;
  due_date: string | null;
};

type ProfileLite = {
  user_id: string;
  display_name: string | null;
  email: string | null;
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
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [weeklySummaryText, setWeeklySummaryText] = useState('');
  const [buildingSummary, setBuildingSummary] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);
  const [weeklyFeedback, setWeeklyFeedback] = useState<string | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

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

        const [tRes, fRes, aRes, pRes] = await Promise.all([
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
          sb.from('user_profiles').select('user_id,display_name,email').limit(1200),
        ]);

        if (tRes.error || fRes.error || aRes.error || pRes.error) {
          throw new Error(tRes.error?.message || fRes.error?.message || aRes.error?.message || pRes.error?.message || 'Falha ao carregar relatórios.');
        }

        if (!active) return;
        setTasks((tRes.data || []) as TaskLite[]);
        setFinance((fRes.data || []) as FinanceLite[]);
        setAgenda((aRes.data || []) as AgendaLite[]);
        setProfiles((pRes.data || []) as ProfileLite[]);
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
    try {
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
    } catch (err) {
      console.error("Report calc error", err);
      return {
        created7d: 0, done7d: 0, overdue: 0, due48: 0,
        weekIncome: 0, weekExpense: 0, net: 0,
        statusBucket: { open: 0, in_progress: 0, paused: 0, done: 0, cancelled: 0 },
        upcomingAgenda: []
      };
    }
  }, [tasks, finance, agenda]);

  async function buildWeeklySummary() {
    setBuildingSummary(true);
    setWeeklyError(null);
    setWeeklyFeedback(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const since7 = new Date(Date.now() - 7 * 86400e3).toISOString();

      const [doneTasksRes, newCasesRes, paidFinanceRes] = await Promise.all([
        sb
          .from('tasks')
          .select('id,done_at,assigned_to_user_id')
          .gte('done_at', since7)
          .limit(1200),
        sb
          .from('cases')
          .select('id,created_at')
          .gte('created_at', since7)
          .limit(1200),
        sb
          .from('finance_transactions')
          .select('id,type,amount_cents,paid_at,status')
          .eq('type', 'income')
          .eq('status', 'paid')
          .gte('paid_at', since7)
          .limit(1200),
      ]);

      if (doneTasksRes.error || newCasesRes.error || paidFinanceRes.error) {
        throw new Error(doneTasksRes.error?.message || newCasesRes.error?.message || paidFinanceRes.error?.message || 'Falha ao gerar fechamento semanal.');
      }

      const weeklyTasks = (doneTasksRes.data || []) as Pick<TaskLite, 'id' | 'done_at' | 'assigned_to_user_id'>[];
      const weeklyCases = (newCasesRes.data || []) as CaseCreatedLite[];
      const weeklyPaidFinance = (paidFinanceRes.data || []) as FinanceLite[];

      const profileById = new Map(
        profiles.map((p) => [p.user_id, p.display_name || p.email || 'Membros'] as const),
      );
      const grouped = new Map<string, { label: string; count: number }>();

      for (const t of weeklyTasks) {
        const key = t.assigned_to_user_id || 'Membros';
        const label = t.assigned_to_user_id ? profileById.get(t.assigned_to_user_id) || 'Membros' : 'Membros';
        const current = grouped.get(key) || { label, count: 0 };
        current.count += 1;
        grouped.set(key, current);
      }

      const linesByLawyer = grouped.size
        ? Array.from(grouped.values()).sort((a, b) => b.count - a.count).map((row) => `• ${row.label}: ${row.count}`).join('\n')
        : '• Membros: 0';

      const paidAmount = weeklyPaidFinance.reduce((acc, item) => acc + Number(item.amount_cents || 0), 0) / 100;

      const summary = [
        '📊 *Fechamento Semanal - Lima Lopes & Diógenes*',
        `✅ Tarefas Concluídas: ${weeklyTasks.length}`,
        `🚀 Novos Casos: ${weeklyCases.length}`,
        `💰 Faturamento (Pago): R$ ${paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        '',
        '👥 Concluídas por advogado:',
        linesByLawyer,
        '',
        '(Bom trabalho equipe!)',
      ].join('\n');

      setWeeklySummaryText(summary);
      setWeeklyFeedback('Relatório semanal gerado. Você pode revisar e editar o texto antes do envio.');
    } catch (e: any) {
      setWeeklyError(e?.message || 'Falha ao gerar fechamento semanal.');
    } finally {
      setBuildingSummary(false);
    }
  }

  async function handleSendWeeklyWhatsapp() {
    if (!weeklySummaryText.trim()) {
      setWeeklyError('Gere o relatório de produtividade antes de enviar.');
      setWeeklyFeedback(null);
      return;
    }

    const target = prompt('Informe o número do Grupo ou do Sócio para envio no WhatsApp:');
    if (!target?.trim()) {
      setWeeklyError('Envio cancelado: informe o WhatsApp do grupo/sócio.');
      setWeeklyFeedback(null);
      return;
    }

    try {
      setSendingWeekly(true);
      setWeeklyError(null);
      setWeeklyFeedback(null);
      await sendWhatsAppText(target.trim(), weeklySummaryText);
      setWeeklyFeedback('Resumo enviado com sucesso no WhatsApp.');
    } catch (e: any) {
      setWeeklyError(e?.message || 'Falha ao enviar o resumo no WhatsApp.');
    } finally {
      setSendingWeekly(false);
    }
  }

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Fechamento da Equipe (Sexta-feira)</div>
          <button className="btn-primary !px-4 !py-2 !text-sm" onClick={() => void buildWeeklySummary()} disabled={loading || buildingSummary}>
            {buildingSummary ? 'Gerando...' : 'Gerar Relatório de Produtividade'}
          </button>
        </div>

        <div className="mt-3 grid gap-3">
          <textarea
            className="input min-h-[180px] !text-sm"
            value={weeklySummaryText}
            onChange={(e) => setWeeklySummaryText(e.target.value)}
            placeholder={'Clique em "Gerar Relatório de Produtividade" para montar o fechamento semanal da equipe.'}
          />

          <button
            className="inline-flex h-[42px] items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500 disabled:opacity-50"
            onClick={() => void handleSendWeeklyWhatsapp()}
            disabled={sendingWeekly || !weeklySummaryText.trim()}
          >
            {sendingWeekly ? 'Enviando...' : '💬 Enviar para o Grupo (WhatsApp)'}
          </button>

          {weeklyError ? <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{weeklyError}</div> : null}
          {weeklyFeedback ? <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{weeklyFeedback}</div> : null}
        </div>
      </Card>

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
