import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, DollarSign, Clock, AlertTriangle, CheckCircle2, CheckSquare, CalendarDays, Users, Filter, Search, ArrowRight, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchEscavadorProcesso, type BrasilApiProcesso } from '@/lib/datajud';
import { Card } from '@/ui/widgets/Card';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { getWorkspaceVisual } from '@/lib/workspaceVisual';
import { ClassicDashboardPage } from '../legacy/ClassicDashboardPage';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type TaskRow = {
  id: string;
  title: string;
  status_v2: 'open' | 'in_progress' | 'paused' | 'done' | 'cancelled' | string;
  priority: string;
  due_at: string | null;
  created_at: string;
  assigned_to_user_id: string | null;
  client_id: string | null;
  case_id: string | null;
  client?: { id: string; name: string }[] | null;
  case?: { id: string; title: string }[] | null;
};

type TeamTaskRow = {
  id: string;
  status_v2: 'open' | 'in_progress' | 'paused' | 'done' | 'cancelled' | string | null;
  due_at: string | null;
  assigned_to_user_id: string | null;
  created_at?: string | null;
  done_at?: string | null;
};

type ProfileLite = { user_id: string; display_name: string | null; email: string | null };

type AgendaItem = {
  id: string;
  kind: string;
  title: string;
  starts_at: string | null;
  due_date: string | null;
  responsible_user_id: string | null;
};

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtShort(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function badgeStatus(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'open') return 'badge badge-gold';
  if (s === 'in_progress') return 'badge';
  if (s === 'paused') return 'badge border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (s === 'done') return 'badge border-green-400/30 bg-green-400/10 text-green-200';
  if (s === 'cancelled') return 'badge border-red-400/30 bg-red-400/10 text-red-200';
  return 'badge';
}

function dueKind(dueAt: string | null) {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffH = (due - now) / 36e5;
  if (diffH < 0) return { label: 'Atrasada', cls: 'badge border-red-400/30 bg-red-400/10 text-red-200' };
  if (diffH <= 24) return { label: 'Hoje', cls: 'badge badge-gold' };
  if (diffH <= 48) return { label: '48h', cls: 'badge border-amber-400/30 bg-amber-400/10 text-amber-200' };
  return null;
}

function formatCnjInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 20);
  const parts = [
    digits.slice(0, 7),
    digits.slice(7, 9),
    digits.slice(9, 13),
    digits.slice(13, 14),
    digits.slice(14, 16),
    digits.slice(16, 20),
  ].filter(Boolean);

  if (parts.length === 0) return '';

  let formatted = parts[0] || '';
  if (parts[1]) formatted += `-${parts[1]}`;
  if (parts[2]) formatted += `.${parts[2]}`;
  if (parts[3]) formatted += `.${parts[3]}`;
  if (parts[4]) formatted += `.${parts[4]}`;
  if (parts[5]) formatted += `.${parts[5]}`;
  return formatted;
}

function formatRadarDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DashboardPage() {
  return getWorkspaceVisual() === 'reference' ? <ReferenceDashboardPage /> : <ClassicDashboardPage />;
}

function ReferenceDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [counts, setCounts] = useState<{ clients: number; cases: number }>({ clients: 0, cases: 0 });
  const [execCards, setExecCards] = useState<{ triagem: number | null; honorarios: number | null; tarefasPendentes: number | null }>({
    triagem: null,
    honorarios: null,
    tarefasPendentes: null,
  });
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);

  const [role, setRole] = useState<string>('');
  const [teamTasks, setTeamTasks] = useState<TeamTaskRow[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<ProfileLite[]>([]);
  const [myTasksLite, setMyTasksLite] = useState<TeamTaskRow[]>([]);
  const [trend, setTrend] = useState<{ day: string; criadas: number | null; concluidas: number | null }[]>([]);
  const [trendUnavailable, setTrendUnavailable] = useState({ created: false, done: false });
  const [taskFilter, setTaskFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming' | 'paused'>('all');
  const [radarCnj, setRadarCnj] = useState('');
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarResult, setRadarResult] = useState<BrasilApiProcesso | null>(null);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [radarWarning, setRadarWarning] = useState<string | null>(null);

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const sb = requireSupabase();
        await getAuthedUser();

        const roleNow = await getMyOfficeRole().catch(() => '');

        const since = new Date(Date.now() - 14 * 86400e3);
        const sinceIso = since.toISOString();
        const days: string[] = [];
        for (let i = 13; i >= 0; i--) {
          days.push(toDateStr(new Date(Date.now() - i * 86400e3)));
        }

        const [c1, c2, t1, a1, myLite, created14, done14, teamT, teamP, execTriagem, execHonorarios, execTarefas] = await Promise.all([
          sb.from('clients').select('id', { count: 'exact', head: true }),
          sb.from('cases').select('id', { count: 'exact', head: true }),
          sb
            .from('tasks')
            .select('id,title,status_v2,priority,due_at,created_at,assigned_to_user_id,client_id,case_id, client:clients(id,name), case:cases(id,title)')
            .neq('status_v2', 'done')
            .neq('status_v2', 'cancelled')
            .order('due_at', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(12),
          // next agenda items: deadlines today + next commitments
          sb
            .from('agenda_items')
            .select('id,kind,title,starts_at,due_date,responsible_user_id')
            .or(`and(kind.eq.deadline,due_date.gte.${todayStr}),and(kind.eq.commitment,starts_at.gte.${new Date().toISOString()})`)
            .order('created_at', { ascending: false })
            .limit(8),

          // tasks summary (for charts) - respects RLS
          sb
            .from('tasks')
            .select('id,status_v2,due_at,assigned_to_user_id')
            .neq('status_v2', 'done')
            .neq('status_v2', 'cancelled')
            .order('due_at', { ascending: true, nullsFirst: false })
            .limit(800),

          // trend: created in 14d
          sb.from('tasks').select('created_at').gte('created_at', sinceIso).limit(2000),
          // trend: done in 14d
          sb.from('tasks').select('done_at').not('done_at', 'is', null).gte('done_at', sinceIso).limit(2000),

          roleNow === 'admin'
            ? sb
                .from('tasks')
                .select('id,status_v2,due_at,assigned_to_user_id')
                .neq('status_v2', 'done')
                .neq('status_v2', 'cancelled')
                .order('due_at', { ascending: true, nullsFirst: false })
                .limit(1200)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
          roleNow === 'admin'
            ? sb.from('user_profiles').select('user_id,display_name,email').order('created_at', { ascending: false }).limit(500)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),

          // --- Executive cards ---
          sb.from('cases').select('id', { count: 'exact', head: true }).ilike('status', 'triagem'),
          sb.from('finance_transactions').select('amount_cents', { count: 'exact' }).eq('type', 'income').eq('status', 'planned'),
          sb.from('tasks').select('id', { count: 'exact', head: true }).in('status_v2', ['open', 'in_progress', 'paused']),
        ]);

        if (c1.error || c2.error || t1.error || a1.error || myLite.error || teamT.error || teamP.error) {
          throw new Error(
            c1.error?.message ||
              c2.error?.message ||
              t1.error?.message ||
              a1.error?.message ||
              myLite.error?.message ||
              teamT.error?.message ||
              teamP.error?.message ||
              'Falha ao carregar.',
          );
        }

        if (!alive) return;

        // An unavailable trend or executive indicator does not hide the work queue.
        setTrendUnavailable({ created: Boolean(created14.error), done: Boolean(done14.error) });
        try {
          const createdMap = new Map<string, number>();
          for (const d of days) createdMap.set(d, 0);
          for (const r of (created14.data || []) as { created_at: string }[]) {
            const d = toDateStr(new Date(r.created_at));
            createdMap.set(d, (createdMap.get(d) || 0) + 1);
          }
          const doneMap = new Map<string, number>();
          for (const d of days) doneMap.set(d, 0);
          for (const r of (done14.data || []) as { done_at: string }[]) {
            const d = toDateStr(new Date(r.done_at));
            doneMap.set(d, (doneMap.get(d) || 0) + 1);
          }
          setTrend(days.map((d) => ({
            day: d.slice(5),
            criadas: created14.error ? null : createdMap.get(d) || 0,
            concluidas: done14.error ? null : doneMap.get(d) || 0,
          })));
        } catch {
          setTrend([]);
          setTrendUnavailable({ created: true, done: true });
        }

        setRole(roleNow);

        setCounts({ clients: c1.count || 0, cases: c2.count || 0 });

        // Executive cards
        const honorariosCents = (execHonorarios.data || []).reduce(
          (sum: number, r: { amount_cents: number }) => sum + (r.amount_cents || 0),
          0,
        );
        setExecCards({
          triagem: execTriagem.error ? null : execTriagem.count ?? null,
          honorarios: execHonorarios.error ? null : honorariosCents,
          tarefasPendentes: execTarefas.error ? null : execTarefas.count ?? null,
        });

        setTasks((t1.data || []) as TaskRow[]);
        setAgenda((a1.data || []) as AgendaItem[]);
        setMyTasksLite((myLite.data || []) as TeamTaskRow[]);
        setTeamTasks((teamT.data || []) as TeamTaskRow[]);
        setTeamProfiles((teamP.data || []) as ProfileLite[]);
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar.');
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [todayStr]);

  const teamStats = useMemo(() => {
    if (role !== 'admin') return null;

    const now = Date.now();
    const openish = teamTasks;

    function badgeKind(dueAt: string | null) {
      if (!dueAt) return 'none' as const;
      const due = new Date(dueAt).getTime();
      const diffH = (due - now) / 36e5;
      if (diffH < 0) return 'overdue' as const;
      if (diffH <= 48) return 'due48' as const;
      return 'ok' as const;
    }

    const by = new Map<string, { total: number; overdue: number; due48: number }>();
    let overdueAll = 0;
    let due48All = 0;

    for (const t of openish) {
      const key = t.assigned_to_user_id || '—';
      const cur = by.get(key) || { total: 0, overdue: 0, due48: 0 };
      cur.total += 1;
      const k = badgeKind(t.due_at);
      if (k === 'overdue') {
        cur.overdue += 1;
        overdueAll += 1;
      }
      if (k === 'due48') {
        cur.due48 += 1;
        due48All += 1;
      }
      by.set(key, cur);
    }

    const profileMap = new Map(teamProfiles.map((p) => [p.user_id, p] as const));
    const rows = Array.from(by.entries())
      .map(([userId, s]) => ({
        userId,
        label: profileMap.get(userId)?.display_name || profileMap.get(userId)?.email || userId.slice(0, 8),
        ...s,
      }))
      .sort((a, b) => (b.overdue - a.overdue) || (b.due48 - a.due48) || (b.total - a.total));

    return { overdueAll, due48All, rows };
  }, [role, teamTasks, teamProfiles]);

  const chartBase = useMemo(() => {
    const base = role === 'admin' ? teamTasks : myTasksLite;

    const statusCounts = new Map<string, number>();
    const risk = { overdue: 0, today: 0, due48: 0, noDue: 0 };

    const now = Date.now();
    for (const t of base) {
      const st = (t.status_v2 || 'open') as string;
      statusCounts.set(st, (statusCounts.get(st) || 0) + 1);

      if (!t.due_at) {
        risk.noDue += 1;
      } else {
        const due = new Date(t.due_at).getTime();
        const diffH = (due - now) / 36e5;
        if (diffH < 0) risk.overdue += 1;
        else if (diffH <= 24) risk.today += 1;
        else if (diffH <= 48) risk.due48 += 1;
      }
    }

    const statusData = [
      { name: 'Aberto', key: 'open', value: statusCounts.get('open') || 0, color: '#b49a68' },
      { name: 'Andamento', key: 'in_progress', value: statusCounts.get('in_progress') || 0, color: '#172026' },
      { name: 'Pausado', key: 'paused', value: statusCounts.get('paused') || 0, color: '#dac9a6' },
      { name: 'Concluído', key: 'done', value: statusCounts.get('done') || 0, color: '#89a38c' },
      { name: 'Cancelado', key: 'cancelled', value: statusCounts.get('cancelled') || 0, color: '#b9babe' },
    ].filter((x) => x.value > 0);

    const riskData = [
      { name: 'Atrasadas', value: risk.overdue, color: '#f87171' },
      { name: 'Hoje', value: risk.today, color: '#b49a68' },
      { name: '48h', value: risk.due48, color: '#dac9a6' },
      { name: 'Sem prazo', value: risk.noDue, color: '#a3a3a3' },
    ];

    return { statusData, riskData };
  }, [role, teamTasks, myTasksLite]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return tasks;
    const now = Date.now();
    return tasks.filter((t) => {
      if (taskFilter === 'paused') return t.status_v2 === 'paused';
      if (!t.due_at) return false;
      const diffH = (new Date(t.due_at).getTime() - now) / 36e5;
      if (taskFilter === 'overdue') return diffH < 0;
      if (taskFilter === 'today') return diffH >= 0 && diffH <= 24;
      if (taskFilter === 'upcoming') return diffH > 24 && diffH <= 48;
      return true;
    });
  }, [tasks, taskFilter]);

  const taskSections = useMemo(() => {
    const now = Date.now();
    const overdue: TaskRow[] = [];
    const today: TaskRow[] = [];
    const upcoming: TaskRow[] = [];
    const noDue: TaskRow[] = [];

    for (const t of tasks) {
      if (!t.due_at) { noDue.push(t); continue; }
      const diffH = (new Date(t.due_at).getTime() - now) / 36e5;
      if (diffH < 0) overdue.push(t);
      else if (diffH <= 24) today.push(t);
      else upcoming.push(t);
    }
    return { overdue, today, upcoming, noDue };
  }, [tasks]);

  const agendaGrouped = useMemo(() => {
    const groups = new Map<string, AgendaItem[]>();
    for (const a of agenda) {
      const dateKey = a.kind === 'deadline'
        ? (a.due_date || 'Sem data')
        : (a.starts_at ? toDateStr(new Date(a.starts_at)) : 'Sem data');
      const items = groups.get(dateKey) || [];
      items.push(a);
      groups.set(dateKey, items);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [agenda]);

  const teamWorkload = useMemo(() => {
    if (role !== 'admin' || !teamStats) return [];
    return teamStats.rows.map((r) => ({
      name: r.label.length > 12 ? r.label.slice(0, 12) + '…' : r.label,
      abertas: r.total - r.overdue - r.due48,
      criticas: r.due48,
      atrasadas: r.overdue,
    }));
  }, [role, teamStats]);

  async function handleRadarSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRadarLoading(true);
    setRadarError(null);
    setRadarWarning(null);
    setRadarResult(null);

    try {
      const result = await fetchEscavadorProcesso(radarCnj);
      setRadarResult(result);
      setRadarWarning(result.warning || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao consultar processo.';
      setRadarError(message);
      setRadarWarning('Serviço nacional de consulta temporariamente indisponível.');
    } finally {
      setRadarLoading(false);
    }
  }

  return (
    <div className="dashboard-reference legacy-space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#172026] sm:text-[28px]">Visão geral do escritório</h1>
          <p className="mt-1 text-sm text-[#717778]">Clientes, processos e prioridades para organizar o seu dia.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[#e2e2dc] bg-white px-3 py-2.5 text-xs text-[#535d62]">
          <CalendarDays className="size-4 text-[#927443]" />
          {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
      {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Clientes cadastrados', value: counts.clients, icon: Users, to: '/app/clientes', caption: 'Cadastro do escritório' },
          { label: 'Casos cadastrados', value: counts.cases, icon: Briefcase, to: '/app/casos', caption: execCards.triagem === null ? 'Triagem indisponível' : `${execCards.triagem} em triagem` },
          role === 'admin'
            ? { label: 'Receitas planejadas', value: execCards.honorarios === null ? null : (execCards.honorarios / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: DollarSign, to: '/app/financeiro', caption: 'Entradas planejadas carregadas' }
            : { label: 'Agenda próxima', value: agenda.length, icon: CalendarDays, to: '/app/agenda', caption: 'Itens de agenda carregados' },
          { label: 'Tarefas pendentes', value: execCards.tarefasPendentes, icon: CheckSquare, to: '/app/tarefas', caption: 'Abertas, em andamento e pausadas' },
        ].map((item) => (
          <Link key={item.label} to={item.to} className="dashboard-metric flex min-w-0 items-center gap-3 rounded-lg border border-[#e5e5e0] bg-white px-4 py-4 transition-colors hover:border-[#b49a68]">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[#b49a68] text-white"><item.icon className="size-5" strokeWidth={1.7} /></div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#535d62]">{item.label}</div>
              <div className="mt-1 break-words text-[25px] font-bold leading-tight tracking-tight text-[#172026]">{loading || error || item.value === null ? '—' : item.value}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#8a8e91]">{loading ? 'Carregando dados...' : error || item.value === null ? 'Dados indisponíveis' : item.caption}</div>
            </div>
          </Link>
        ))}
      </div>
      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="dashboard-tabs flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-[#deded8] bg-transparent p-0">
          <TabsTrigger value="insights">Visão geral</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>
        <TabsContent value="insights" className="mt-4 legacy-space-y-4">
          <div className="grid min-w-0 gap-3 lg:grid-cols-3">
            <Card className="dashboard-card">
              <h2 className="text-sm font-semibold">Tarefas por situação</h2>
              <p className="mt-1 text-[11px] text-[#8a8e91]">Pendências carregadas · {role === 'admin' ? 'equipe' : 'acesso do usuário'}</p>
              <div className="relative mt-2 h-[210px]">
                {loading || error ? <div className="dashboard-chart-empty">{loading ? 'Carregando...' : 'Dados indisponíveis'}</div> : chartBase.statusData.length ? <>
                  <ResponsiveContainer width="100%" height="100%"><PieChart>
                    <Pie data={chartBase.statusData} dataKey="value" nameKey="name" isAnimationActive={false} innerRadius={54} outerRadius={76} paddingAngle={1} cy="43%">
                      {chartBase.statusData.map((item) => <Cell key={item.key} fill={item.color} />)}
                    </Pie><Tooltip /><Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart></ResponsiveContainer>
                  <div className="pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 text-center"><div className="text-2xl font-bold">{chartBase.statusData.reduce((sum, item) => sum + item.value, 0)}</div><div className="text-[10px] text-[#8a8e91]">tarefas</div></div>
                </> : <div className="dashboard-chart-empty">Nenhuma tarefa pendente.</div>}
              </div>
            </Card>
            <Card className="dashboard-card">
              <h2 className="text-sm font-semibold">Tarefas criadas</h2><p className="mt-1 text-[11px] text-[#8a8e91]">Evolução nos últimos 14 dias</p>
              <div className="mt-4 h-[190px]">
                {loading || error || trendUnavailable.created ? <div className="dashboard-chart-empty">{loading ? 'Carregando...' : 'Dados indisponíveis'}</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ left: -22, right: 3, bottom: 0 }}>
                  <XAxis dataKey="day" stroke="#969c9f" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e2dc' }} interval={3} /><YAxis allowDecimals={false} stroke="#969c9f" fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Bar name="Criadas" dataKey="criadas" isAnimationActive={false} fill="#b49a68" radius={[2, 2, 0, 0]} maxBarSize={22} />
                </BarChart></ResponsiveContainer>}
              </div>
            </Card>
            <Card className="dashboard-card">
              <h2 className="text-sm font-semibold">Tarefas concluídas</h2><p className="mt-1 text-[11px] text-[#8a8e91]">Evolução nos últimos 14 dias</p>
              <div className="mt-4 h-[190px]">
                {loading || error || trendUnavailable.done ? <div className="dashboard-chart-empty">{loading ? 'Carregando...' : 'Dados indisponíveis'}</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ left: -22, right: 3, bottom: 0 }}>
                  <XAxis dataKey="day" stroke="#969c9f" fontSize={10} tickLine={false} axisLine={{ stroke: '#e2e2dc' }} interval={3} /><YAxis allowDecimals={false} stroke="#969c9f" fontSize={10} tickLine={false} axisLine={false} /><Tooltip /><Area name="Concluídas" type="monotone" dataKey="concluidas" isAnimationActive={false} stroke="#172026" fill="#172026" fillOpacity={0.08} strokeWidth={2} dot={{ r: 2 }} />
                </AreaChart></ResponsiveContainer>}
              </div>
            </Card>
          </div>
          <Card className="dashboard-card">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Fila de trabalho</h2><p className="mt-1 text-[11px] text-[#8a8e91]">Até 12 pendências carregadas, organizadas por prazo</p></div><Link to="/app/tarefas/kanban" className="dashboard-action"><Plus className="size-3.5" />Abrir Kanban</Link></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { name: 'Atrasadas', rows: taskSections.overdue, tone: 'bg-[#fae7e3] text-[#9c493c]' },
                { name: 'Próximas 24h', rows: taskSections.today, tone: 'bg-[#f7edcf] text-[#87682f]' },
                { name: 'Próximos dias', rows: taskSections.upcoming, tone: 'bg-[#e8edf2] text-[#4d6176]' },
                { name: 'Sem prazo', rows: taskSections.noDue, tone: 'bg-[#e9eae8] text-[#596262]' },
              ].map((column) => <div key={column.name} className="min-w-0 rounded-md border border-[#ecece7] bg-[#fafaf8]"><div className={`flex items-center justify-between rounded-t-md px-3 py-2 text-xs font-semibold ${column.tone}`}><span>{column.name}</span><span>{loading || error ? '—' : column.rows.length}</span></div><div className="p-2">
                {loading || error ? <p className="p-2 text-xs text-[#8a8e91]">{loading ? 'Carregando...' : 'Dados indisponíveis'}</p> : column.rows.length ? column.rows.slice(0, 3).map((task) => <Link key={task.id} to={`/app/tarefas/${task.id}`} className="block border-b border-[#ecece7] px-2 py-2.5 last:border-0 hover:bg-white"><div className="truncate text-xs font-semibold text-[#253037]">{task.title}</div><div className="mt-1 truncate text-[11px] text-[#8a8e91]">{task.client?.[0]?.name || task.case?.[0]?.title || 'Tarefa do escritório'}</div><div className="mt-1 text-[10px] text-[#8a8e91]">{fmtShort(task.due_at)}</div></Link>) : <p className="p-2 text-xs text-[#8a8e91]">Nenhuma pendência.</p>}
              </div></div>)}
            </div>
          </Card>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="dashboard-card"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Próximas tarefas</h2><Link to="/app/tarefas" className="text-[11px] text-[#927443] hover:underline">Ver todas</Link></div><div className="mt-3 legacy-space-y-3">
              {!loading && !error && tasks.length === 0 ? <p className="text-xs text-[#8a8e91]">Nenhuma tarefa pendente.</p> : null}
              {tasks.slice(0, 3).map((task) => <Link key={task.id} to={`/app/tarefas/${task.id}`} className="flex items-start gap-2.5"><CheckSquare className="mt-0.5 size-4 shrink-0 text-[#8a8e91]" strokeWidth={1.5} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{task.title}</div><div className="mt-1 text-[11px] text-[#8a8e91]">{fmtShort(task.due_at)}</div></div>{dueKind(task.due_at) ? <span className={dueKind(task.due_at)!.cls}>{dueKind(task.due_at)!.label}</span> : null}</Link>)}
            </div></Card>
            <Card className="dashboard-card"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Prazos e compromissos</h2><Link to="/app/agenda" className="text-[11px] text-[#927443] hover:underline">Ver todos</Link></div><div className="mt-3 legacy-space-y-3">
              {!loading && !error && agenda.length === 0 ? <p className="text-xs text-[#8a8e91]">Nenhum item agendado.</p> : null}
              {agenda.slice(0, 3).map((item) => <Link key={item.id} to="/app/agenda" className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f0e9db] text-[#927443]"><CalendarDays className="size-4" /></span><div className="min-w-0"><div className="truncate text-xs font-medium">{item.title}</div><div className="mt-1 text-[11px] text-[#8a8e91]">{item.kind === 'deadline' ? `Prazo · ${item.due_date?.split('-').reverse().join('/') || '—'}` : fmtShort(item.starts_at)}</div></div></Link>)}
            </div></Card>
            <Card className="dashboard-card"><h2 className="text-sm font-semibold">Acesso rápido</h2><div className="mt-3 legacy-space-y-2">
              {[['/app/tarefas', 'Tarefas e prazos'], ['/app/clientes', 'Cadastro de clientes'], ['/app/documentos/gerar', 'Gerar documentos'], ['/app/casos', 'Casos e processos']].map(([to, label]) => <Link key={to} to={to} className="flex items-center justify-between rounded-md border border-[#e8e8e3] px-3 py-2 text-xs text-[#535d62] hover:border-[#b49a68]">{label}<ArrowRight className="size-3.5 text-[#927443]" /></Link>)}
            </div></Card>
          </div>
          <p className="text-[10px] text-[#8a8e91]">Os gráficos usam as tarefas acessíveis nesta conta e os limites de carregamento do painel.</p>
        </TabsContent>
        <TabsContent value="tarefas" className="mt-4 legacy-space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Tarefas</div>
                <div className="text-xs text-white/60">Acompanhe a esteira e delegação.</div>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/app/tarefas/kanban" className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs">Kanban</Link>
                <Link to="/app/tarefas" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">Lista</Link>
              </div>
            </div>
          </Card>

          {/* Quick stats */}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Atrasadas', value: taskSections.overdue.length, color: 'text-red-300', icon: AlertTriangle },
              { label: 'Hoje', value: taskSections.today.length, color: 'text-amber-300', icon: Clock },
              { label: 'Próximas', value: taskSections.upcoming.length, color: 'text-sky-300', icon: CalendarDays },
              { label: 'Sem prazo', value: taskSections.noDue.length, color: 'text-white/60', icon: Filter },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <s.icon size={16} className={s.color} />
                <div>
                  <div className={`text-xl font-bold ${s.color}`}>{loading ? '—' : s.value}</div>
                  <div className="text-xs text-white/60">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'Todas'],
              ['overdue', 'Atrasadas'],
              ['today', 'Hoje'],
              ['upcoming', 'Próximas 48h'],
              ['paused', 'Pausadas'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTaskFilter(key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  taskFilter === key
                    ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div className="grid gap-2">
            {loading && <div className="text-sm text-white/70">Carregando…</div>}
            {!loading && filteredTasks.length === 0 && <div className="text-sm text-white/60">Nenhuma tarefa nesta categoria.</div>}
            {filteredTasks.map((t) => {
              const due = dueKind(t.due_at);
              return (
                <Link
                  key={t.id}
                  to={`/app/tarefas/${t.id}`}
                  className="group rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-transparent p-4 transition-all hover:border-white/20 hover:from-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {due?.label === 'Atrasada' && <AlertTriangle size={14} className="text-red-400" />}
                      {due?.label === 'Hoje' && <Clock size={14} className="text-amber-400" />}
                      <div className="text-sm font-semibold text-white group-hover:text-amber-100">{t.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {due && <span className={due.cls}>{due.label}</span>}
                      <span className={badgeStatus(t.status_v2)}>{t.status_v2}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                    <span>Prazo: <span className="text-white/80">{t.due_at ? fmtShort(t.due_at) : '—'}</span></span>
                    <span>Prioridade: <span className="text-white/80">{t.priority}</span></span>
                    {t.client?.[0] && <span>Cliente: <span className="text-white/80">{t.client[0].name}</span></span>}
                    {t.case?.[0] && <span>Caso: <span className="text-white/80">{t.case[0].title}</span></span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="mt-4 legacy-space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Agenda</div>
                <div className="text-xs text-white/60">Compromissos e prazos próximos.</div>
              </div>
              <Link to="/app/agenda" className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs">Abrir agenda</Link>
            </div>
          </Card>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <CalendarDays size={14} className="text-amber-300" />
              <span className="text-xs text-white/80">
                <span className="font-semibold text-white">{agenda.filter((a) => a.kind === 'deadline').length}</span> prazos
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Clock size={14} className="text-sky-300" />
              <span className="text-xs text-white/80">
                <span className="font-semibold text-white">{agenda.filter((a) => a.kind === 'commitment').length}</span> compromissos
              </span>
            </div>
          </div>

          {/* Grouped by date */}
          {loading && <div className="text-sm text-white/70">Carregando…</div>}
          {!loading && agenda.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CalendarDays size={32} className="text-white/20" />
                <div className="text-sm text-white/60">Nenhum item agendado.</div>
                <Link to="/app/agenda" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs mt-2">Criar compromisso</Link>
              </div>
            </Card>
          )}
          {agendaGrouped.map(([dateKey, items]) => {
            const isToday = dateKey === todayStr;
            const displayDate = dateKey === 'Sem data' ? dateKey : new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
            return (
              <div key={dateKey}>
                <div className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-amber-300' : 'text-white/50'}`}>
                  {isToday && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
                  {displayDate}
                  {isToday && <span className="text-[10px] normal-case tracking-normal text-amber-200/70">(hoje)</span>}
                </div>
                <div className="grid gap-2">
                  {items.map((a) => (
                    <Link
                      key={a.id}
                      to="/app/agenda"
                      className="group rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-transparent p-4 transition-all hover:border-white/20 hover:from-white/10"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {a.kind === 'deadline'
                            ? <AlertTriangle size={14} className="text-amber-400" />
                            : <CalendarDays size={14} className="text-sky-400" />
                          }
                          <div className="text-sm font-semibold text-white group-hover:text-amber-100">{a.title}</div>
                        </div>
                        <span className={a.kind === 'deadline' ? 'badge badge-gold' : 'badge'}>
                          {a.kind === 'deadline' ? 'Prazo' : 'Compromisso'}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-white/60">
                        {a.kind === 'deadline'
                          ? `Data limite: ${a.due_date || '—'}`
                          : `Início: ${fmtShort(a.starts_at)}`
                        }
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="equipe" className="mt-4 legacy-space-y-4">
          {role === 'admin' ? (
            <>
              <Card>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Gestão de Equipe</div>
                    <div className="text-xs text-white/60">Carga de trabalho e produtividade por membro.</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/80">
                      <Users size={12} className="text-sky-300" />
                      Membros: <span className="text-sky-200">{teamProfiles.length}</span>
                    </div>
                    {teamStats && (
                      <>
                        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 font-semibold text-amber-200">
                          Críticas (48h): {teamStats.due48All}
                        </div>
                        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-1.5 font-semibold text-red-200">
                          Atrasadas: {teamStats.overdueAll}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Workload chart */}
              {teamWorkload.length > 0 && (
                <Card className="border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent">
                  <div className="text-sm font-semibold text-white">Distribuição de carga</div>
                  <div className="text-xs text-white/60">Tarefas por responsável (abertas vs críticas vs atrasadas).</div>
                  <div className="mt-4 h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamWorkload} layout="vertical">
                        <XAxis type="number" stroke="#969c9f" fontSize={12} />
                        <YAxis dataKey="name" type="category" stroke="#969c9f" fontSize={11} width={90} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="abertas" stackId="a" fill="#93c5fd" name="Abertas" />
                        <Bar dataKey="criticas" stackId="a" fill="#fbbf24" name="Críticas (48h)" />
                        <Bar dataKey="atrasadas" stackId="a" fill="#f87171" name="Atrasadas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {/* Team member cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {teamStats?.rows.map((r) => {
                  const pct = r.total > 0 ? Math.round(((r.total - r.overdue) / r.total) * 100) : 100;
                  const urgency = r.overdue > 0 ? 'border-red-400/30' : r.due48 > 0 ? 'border-amber-400/30' : 'border-white/10';
                  return (
                    <div
                      key={r.userId}
                      className={`rounded-xl border ${urgency} bg-gradient-to-br from-white/10 to-white/5 p-4 transition-all`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                          {r.label.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{r.label}</div>
                          <div className="text-xs text-white/50">{r.total} tarefa{r.total !== 1 ? 's' : ''} aberta{r.total !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {r.overdue > 0 && (
                          <span className="badge border-red-400/30 bg-red-400/10 text-red-200">
                            {r.overdue} atrasada{r.overdue !== 1 ? 's' : ''}
                          </span>
                        )}
                        {r.due48 > 0 && (
                          <span className="badge badge-gold">
                            {r.due48} crítica{r.due48 !== 1 ? 's' : ''} (48h)
                          </span>
                        )}
                        {r.overdue === 0 && r.due48 === 0 && (
                          <span className="badge border-green-400/30 bg-green-400/10 text-green-200">
                            <CheckCircle2 size={10} className="mr-1 inline" />Em dia
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-white/50">
                          <span>Saúde</span>
                          <span className={pct >= 80 ? 'text-green-300' : pct >= 50 ? 'text-amber-300' : 'text-red-300'}>{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {teamStats?.rows.length === 0 && (
                <Card>
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Users size={32} className="text-white/20" />
                    <div className="text-sm text-white/60">Nenhum membro com tarefas pendentes.</div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Users size={36} className="text-white/20" />
                <div className="text-sm font-semibold text-white">Equipe</div>
                <div className="text-xs text-white/60">O painel de gestão de equipe está disponível para administradores.</div>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <details className="rounded-lg border border-[#e5e5e0] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#535d62]">Consultar processo no Escavador</summary>
        <div className="px-1 pb-1">
      <Card className="dashboard-card">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Radar de Processos (Escavador)</div>
            <div className="mt-1 text-xs text-white/60">
              Consulte um processo em formato CNJ para inspecionar tribunal, última movimentação e status atual via Escavador.
            </div>
          </div>
          <span className="badge border-amber-300/30 bg-amber-300/10 text-amber-100">API Escavador</span>
        </div>

        <form onSubmit={handleRadarSubmit} className="mt-4 flex flex-col gap-3 lg:flex-row">
          <div className="flex-1">
            <Input
              value={radarCnj}
              onChange={(event) => setRadarCnj(formatCnjInput(event.target.value))}
              inputMode="numeric"
              placeholder="0000000-00.0000.0.00.0000"
              className="h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
          </div>
          <Button
            type="submit"
            disabled={radarLoading}
            className="h-11 rounded-xl bg-amber-400 px-5 text-black hover:bg-amber-300 disabled:bg-amber-400/60"
          >
            <Search className="mr-2 size-4" />
            {radarLoading ? 'Buscando...' : 'Buscar processo'}
          </Button>
        </form>

        <div className="mt-2 text-[11px] text-white/45">
          Formato aceito: XXXXXXX-XX.XXXX.X.XX.XXXX
        </div>

        {radarWarning ? <div className="mt-3 text-sm text-amber-200/90">{radarWarning}</div> : null}
        {radarError ? <div className="mt-3 text-sm text-red-200">{radarError}</div> : null}

        {radarResult ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Processo</div>
                <div className="mt-1 text-lg font-semibold text-white">{radarResult.numero}</div>
              </div>
              <span className="badge border-green-400/30 bg-green-400/10 text-green-200">
                {radarResult.status}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/45">Tribunal</div>
                <div className="mt-1 text-sm font-medium text-amber-200">{radarResult.tribunal}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider text-white/45">Última movimentação</div>
                <div className="mt-1 text-sm font-medium text-white">{radarResult.ultimoAndamento}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/45">Data</div>
                <div className="mt-1 text-sm font-medium text-amber-200">{formatRadarDate(radarResult.dataUltimoAndamento)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider text-white/45">Status</div>
                <div className="mt-1 text-sm font-medium text-amber-200">{radarResult.status}</div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

        </div>
      </details>
    </div>
  );
}
