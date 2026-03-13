import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Hero1951 } from '@/components/ui/hero-195-1';
import { Card } from '@/ui/widgets/Card';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

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

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [counts, setCounts] = useState<{ clients: number; cases: number }>({ clients: 0, cases: 0 });
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);

  const [role, setRole] = useState<string>('');
  const [teamTasks, setTeamTasks] = useState<TeamTaskRow[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<ProfileLite[]>([]);
  const [myTasksLite, setMyTasksLite] = useState<TeamTaskRow[]>([]);
  const [trend, setTrend] = useState<{ day: string; criadas: number; concluidas: number }[]>([]);

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

        const [c1, c2, t1, a1, myLite, created14, done14, teamT, teamP] = await Promise.all([
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
            : Promise.resolve({ data: [], error: null } as any),
          roleNow === 'admin'
            ? sb.from('user_profiles').select('user_id,display_name,email').order('created_at', { ascending: false }).limit(500)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        // compute trend
        try {
          const createdMap = new Map<string, number>();
          for (const d of days) createdMap.set(d, 0);
          for (const r of (created14.data || []) as any[]) {
            const d = toDateStr(new Date(r.created_at));
            createdMap.set(d, (createdMap.get(d) || 0) + 1);
          }
          const doneMap = new Map<string, number>();
          for (const d of days) doneMap.set(d, 0);
          for (const r of (done14.data || []) as any[]) {
            const d = toDateStr(new Date(r.done_at));
            doneMap.set(d, (doneMap.get(d) || 0) + 1);
          }
          setTrend(days.map((d) => ({ day: d.slice(5), criadas: createdMap.get(d) || 0, concluidas: doneMap.get(d) || 0 })));
        } catch {
          setTrend([]);
        }

        setRole(roleNow);

        if (c1.error || c2.error || t1.error || a1.error || myLite.error || created14.error || done14.error || teamT.error || teamP.error) {
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

        setCounts({ clients: c1.count || 0, cases: c2.count || 0 });
        setTasks((t1.data || []) as TaskRow[]);
        setAgenda((a1.data || []) as AgendaItem[]);
        setMyTasksLite((myLite.data || []) as TeamTaskRow[]);
        setTeamTasks((teamT.data || []) as TeamTaskRow[]);
        setTeamProfiles((teamP.data || []) as ProfileLite[]);
        setLoading(false);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Erro ao carregar.');
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
      { name: 'Aberto', key: 'open', value: statusCounts.get('open') || 0, color: '#f59e0b' },
      { name: 'Andamento', key: 'in_progress', value: statusCounts.get('in_progress') || 0, color: '#93c5fd' },
      { name: 'Pausado', key: 'paused', value: statusCounts.get('paused') || 0, color: '#fbbf24' },
      { name: 'Concluído', key: 'done', value: statusCounts.get('done') || 0, color: '#86efac' },
      { name: 'Cancelado', key: 'cancelled', value: statusCounts.get('cancelled') || 0, color: '#fca5a5' },
    ].filter((x) => x.value > 0);

    const riskData = [
      { name: 'Atrasadas', value: risk.overdue, color: '#f87171' },
      { name: 'Hoje', value: risk.today, color: '#f59e0b' },
      { name: '48h', value: risk.due48, color: '#fbbf24' },
      { name: 'Sem prazo', value: risk.noDue, color: '#a3a3a3' },
    ];

    return { statusData, riskData };
  }, [role, teamTasks, myTasksLite]);

  const baseTasks = role === 'admin' ? teamTasks : myTasksLite;

  const kpis = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let paused = 0;
    let today = 0;
    let due48 = 0;

    const now = Date.now();
    for (const t of baseTasks) {
      const st = (t.status_v2 || 'open') as string;
      if (st === 'paused') paused += 1;
      if (st !== 'done' && st !== 'cancelled') pending += 1;

      if (t.due_at) {
        const due = new Date(t.due_at).getTime();
        const diffH = (due - now) / 36e5;
        if (diffH < 0) overdue += 1;
        else if (diffH <= 24) today += 1;
        else if (diffH <= 48) due48 += 1;
      }
    }

    const agendaToday = agenda.filter((a) => a.kind === 'deadline' ? (a.due_date || '') === todayStr : true).length;

    return { pending, overdue, paused, today, due48, agendaToday };
  }, [baseTasks, agenda, todayStr]);

  const kpiCards = [
    { label: 'Pendentes', value: kpis.pending, to: '/app/tarefas', tone: 'text-white', chip: 'Visão geral' },
    { label: 'Atrasadas', value: kpis.overdue, to: '/app/tarefas', tone: 'text-red-200', chip: 'Atenção' },
    { label: 'Pausadas', value: kpis.paused, to: '/app/tarefas', tone: 'text-amber-200', chip: 'Bloqueios' },
    { label: 'Vencem hoje', value: kpis.today, to: '/app/tarefas', tone: 'text-white', chip: 'Urgente' },
    { label: 'Próx. 48h', value: kpis.due48, to: '/app/tarefas', tone: 'text-white', chip: 'Janela crítica' },
    { label: 'Agenda hoje', value: kpis.agendaToday, to: '/app/agenda', tone: 'text-white', chip: 'Compromissos' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_0%_0%,rgba(251,191,36,0.15),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">Castro de Oliveira Adv</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Dashboard executivo</h1>
            <p className="mt-1 text-sm text-white/60">Visão geral de clientes, casos, agenda e tarefas em tempo real.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/clientes" className="btn-ghost !border-white/20 !bg-white/10">
              Clientes
            </Link>
            <Link to="/app/casos" className="btn-ghost !border-white/20 !bg-white/10">
              Casos
            </Link>
            <Link to="/app/tarefas" className="btn-primary shadow-[0_10px_30px_rgba(255,255,255,0.18)]">
              Nova tarefa
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Hero1951 />

      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl border border-white/15 bg-gradient-to-r from-white/10 to-white/5 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-4 space-y-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {kpiCards.map((k) => (
              <Link
                key={k.label}
                to={k.to}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 transition-all hover:-translate-y-0.5 hover:border-amber-300/30 hover:from-white/15 hover:to-white/10"
              >
                <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-300/10 blur-2xl transition-opacity group-hover:bg-amber-300/20" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="text-xs text-white/65">{k.label}</div>
                  <span className="badge border-white/15 bg-white/5 text-[10px] text-white/70">{k.chip}</span>
                </div>
                <div className={`relative mt-2 text-2xl font-semibold ${k.tone}`}>{loading ? '—' : k.value}</div>
                <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-amber-300/50 to-white/40 transition-all group-hover:w-2/3" />
                </div>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Esteira (14 dias)</div>
                  <div className="text-xs text-white/60">Criadas vs Concluídas — se criadas &gt; concluídas, a fila cresce.</div>
                </div>
                <span className="badge border-amber-300/30 bg-amber-300/10 text-amber-100">Produtividade</span>
              </div>

              <div className="mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="criadas" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="concluidas" stroke="#86efac" fill="#86efac" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="border-white/15 bg-gradient-to-b from-white/10 to-white/5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Atalhos</div>
                <span className="badge">Ações rápidas</span>
              </div>
              <div className="mt-3 grid gap-2">
                <Link to="/app/tarefas/kanban" className="btn-primary">Kanban</Link>
                <Link to="/app/agenda" className="btn-ghost">Agenda</Link>
                <Link to="/app/casos" className="btn-ghost">Casos</Link>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="text-xs text-white/60">Clientes</div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="text-3xl font-semibold text-white">{loading ? '—' : counts.clients}</div>
            <Link className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" to="/app/clientes">
              Abrir
            </Link>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-white/60">Casos</div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="text-3xl font-semibold text-white">{loading ? '—' : counts.cases}</div>
            <Link className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" to="/app/casos">
              Abrir
            </Link>
          </div>
        </Card>
      </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Saúde das tarefas</div>
              <div className="text-xs text-white/60">Distribuição por status (pontos secos aparecem em Pausado/Atrasadas).</div>
            </div>
          </div>

          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartBase.statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
                  {chartBase.statusData.map((e, idx) => (
                    <Cell key={idx} fill={(e as any).color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Risco / Gargalos</div>
              <div className="text-xs text-white/60">Atrasadas, hoje, 48h e sem prazo.</div>
            </div>
          </div>

          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartBase.riskData}>
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="value">
                  {chartBase.riskData.map((e, idx) => (
                    <Cell key={idx} fill={(e as any).color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Heavy finance charts removed from Dashboard to keep mobile fast. */}

      {teamStats ? (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Equipe (gestão)</div>
              <div className="text-xs text-white/60">Pendências por responsável (admin).</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/80">
                Críticas (48h): <span className="text-amber-200">{teamStats.due48All}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/80">
                Atrasadas: <span className="text-red-200">{teamStats.overdueAll}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {teamStats.rows.slice(0, 8).map((r) => (
              <div key={r.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-gradient-to-r from-white/10 to-white/5 p-3">
                <div className="text-sm font-semibold text-white">{r.label}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="badge border-white/20 bg-white/10">{r.total} abertas</span>
                  {r.due48 ? <span className="badge badge-gold">{r.due48} (48h)</span> : null}
                  {r.overdue ? <span className="badge border-red-400/30 bg-red-400/10 text-red-200">{r.overdue} atras.</span> : null}
                </div>
              </div>
            ))}
            {teamStats.rows.length === 0 ? <div className="text-sm text-white/60">Sem tarefas pendentes.</div> : null}
          </div>
        </Card>
      ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Lembretes de tarefas</div>
              <div className="text-xs text-white/60">Atrasadas · hoje · próximas</div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/app/tarefas/kanban" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                Kanban
              </Link>
              <Link to="/app/tarefas" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                Ver todas
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
            {!loading && tasks.length === 0 ? <div className="text-sm text-white/60">Nada pendente.</div> : null}
            {tasks.map((t) => {
              const due = dueKind(t.due_at);
              return (
                <Link
                  key={t.id}
                  to={`/app/tarefas/${t.id}`}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{t.title}</div>
                    <div className="flex items-center gap-2">
                      {due ? <span className={due.cls}>{due.label}</span> : null}
                      <span className={badgeStatus(t.status_v2)}>{t.status_v2}</span>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1 text-xs text-white/60">
                    <div>
                      Prazo: <span className="text-white/80">{t.due_at ? fmtShort(t.due_at) : '—'}</span> · Prioridade:{' '}
                      <span className="text-white/80">{t.priority}</span>
                    </div>
                    {t.client?.[0] ? (
                      <div>
                        Cliente: <span className="text-white/80">{t.client[0].name}</span>
                      </div>
                    ) : null}
                    {t.case?.[0] ? (
                      <div>
                        Caso: <span className="text-white/80">{t.case[0].title}</span>
                      </div>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Agenda</div>
              <div className="text-xs text-white/60">Próximos itens</div>
            </div>
            <Link to="/app/agenda" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
              Abrir agenda
            </Link>
          </div>

          <div className="mt-4 grid gap-2">
            {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
            {!loading && agenda.length === 0 ? <div className="text-sm text-white/60">Nada agendado.</div> : null}
            {agenda.map((a) => (
              <Link key={a.id} to="/app/agenda" className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10">
                <div className="text-sm font-semibold text-white">
                  {a.title}{' '}
                  <span className={a.kind === 'deadline' ? 'badge badge-gold' : 'badge'}>
                    {a.kind === 'deadline' ? 'Prazo' : 'Compromisso'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {a.kind === 'deadline' ? `Data: ${a.due_date || '—'}` : `Início: ${fmtShort(a.starts_at)}`}
                </div>
              </Link>
            ))}
          </div>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="tarefas" className="mt-4 space-y-4">
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
        </TabsContent>

        <TabsContent value="agenda" className="mt-4 space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Agenda</div>
                <div className="text-xs text-white/60">Compromissos e prazos.</div>
              </div>
              <Link to="/app/agenda" className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs">Abrir agenda</Link>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="equipe" className="mt-4 space-y-4">
          {role === 'admin' ? (
            <Card>
              <div className="text-sm font-semibold text-white">Equipe (admin)</div>
              <div className="mt-1 text-xs text-white/60">Use o bloco de gestão no Insights.</div>
            </Card>
          ) : (
            <Card>
              <div className="text-sm font-semibold text-white">Equipe</div>
              <div className="mt-1 text-xs text-white/60">Disponível para admin.</div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
