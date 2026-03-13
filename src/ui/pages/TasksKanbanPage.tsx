import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { Card } from '@/ui/widgets/Card';
import { KanbanCard, KanbanColumn } from '@/ui/widgets/kanbanDnd';
import { loadCasesLite, type CaseLite } from '@/lib/loadCasesLite';
import { loadClientsLite } from '@/lib/loadClientsLite';
import type { ClientLite } from '@/lib/types';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type TaskStatus = 'open' | 'in_progress' | 'paused' | 'done' | 'cancelled';

type Profile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  office_id: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | string;
  status_v2: TaskStatus;
  due_at: string | null;
  assigned_to_user_id: string | null;
  client_id: string | null;
  case_id: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'open', label: 'Aberto' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'paused', label: 'Pausado' },
  { id: 'done', label: 'Concluído' },
  { id: 'cancelled', label: 'Cancelado' },
];

function fmtDT(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function profileLabel(p: Profile) {
  return p.display_name || p.email || p.user_id.slice(0, 8);
}

function dueBadge(t: { due_at: string | null; status_v2: TaskStatus }) {
  if (!t.due_at) return null;
  if (t.status_v2 === 'done' || t.status_v2 === 'cancelled') return null;

  const due = new Date(t.due_at).getTime();
  const now = Date.now();
  const diffH = (due - now) / 36e5;

  if (diffH < 0) return { label: 'Atrasada', cls: 'badge border-red-400/30 bg-red-400/10 text-red-200' };
  if (diffH <= 24) return { label: 'Vence hoje', cls: 'badge badge-gold' };
  if (diffH <= 48) return { label: 'Vence em 48h', cls: 'badge border-amber-400/30 bg-amber-400/10 text-amber-200' };
  return null;
}

function slaBadge(t: { due_at: string | null; status_v2: TaskStatus; priority: string }) {
  if (!t.due_at || t.status_v2 === 'done' || t.status_v2 === 'cancelled') return null;

  const due = new Date(t.due_at).getTime();
  const diffH = (due - Date.now()) / 36e5;
  const pr = (t.priority || 'medium').toLowerCase();

  if (diffH < 0) {
    return { label: 'SLA violado', cls: 'badge border-red-500/40 bg-red-500/15 text-red-200' };
  }

  const thresholds: Record<string, number> = {
    high: 24,
    medium: 48,
    low: 72,
  };

  const lim = thresholds[pr] ?? 48;
  if (diffH <= lim) {
    return { label: 'SLA em risco', cls: 'badge border-amber-400/30 bg-amber-400/10 text-amber-200' };
  }

  return { label: 'SLA ok', cls: 'badge border-emerald-400/30 bg-emerald-400/10 text-emerald-200' };
}

function staleBadge(t: { updated_at: string | null; created_at: string; status_v2: TaskStatus }) {
  if (t.status_v2 === 'done' || t.status_v2 === 'cancelled') return null;

  const lastChange = t.updated_at ? new Date(t.updated_at).getTime() : new Date(t.created_at).getTime();
  const diffDays = Math.floor((Date.now() - lastChange) / (1000 * 60 * 60 * 24));

  if (diffDays >= 7) {
    return { label: `Parada há ${diffDays} dias`, cls: 'badge border-rose-500/40 bg-rose-500/15 text-rose-200' };
  }
  if (diffDays >= 3) {
    return { label: `Parada há ${diffDays} dias`, cls: 'badge border-amber-400/30 bg-amber-400/10 text-amber-200' };
  }
  
  return null;
}

export function TasksKanbanPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [role, setRole] = useState<string>('');

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [cases, setCases] = useState<CaseLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const isAdmin = role === 'admin';
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p] as const)), [profiles]);
  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c] as const)), [clients]);
  const casesMap = useMemo(() => new Map(cases.map((c) => [c.id, c] as const)), [cases]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      setMyUserId(user.id);

      const r = await getMyOfficeRole().catch(() => '');
      setRole(r);

      // best-effort upsert profile (names)
      try {
        await sb
          .from('user_profiles')
          .upsert(
            {
              user_id: user.id,
              email: (user as any)?.email || null,
              display_name: (user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || null,
            } as any,
            { onConflict: 'user_id' },
          )
          .select('user_id')
          .maybeSingle();
      } catch {
        // ignore
      }

      const [{ data, error: qErr }, clientsLite, casesLite, { data: ps }] = await Promise.all([
        sb
          .from('tasks')
          .select(
            'id,title,priority,status_v2,due_at,assigned_to_user_id,client_id,case_id,paused_at,pause_reason,cancelled_at,cancel_reason,done_at,created_at,updated_at',
          )
          .order('created_at', { ascending: false })
          .limit(500),
        loadClientsLite().catch(() => [] as ClientLite[]),
        loadCasesLite().catch(() => [] as CaseLite[]),
        sb.from('user_profiles').select('user_id,display_name,email,office_id').order('created_at', { ascending: false }).limit(500),
      ]);

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as TaskRow[]);
      setClients(clientsLite);
      setCases(casesLite);
      setProfiles((ps || []) as Profile[]);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar kanban.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    let out = rows;

    if (assigneeFilter !== 'all') {
      out = out.filter((r) => (r.assigned_to_user_id || '') === assigneeFilter);
    }

    if (priorityFilter !== 'all') {
      out = out.filter((r) => (r.priority || '').toLowerCase() === priorityFilter);
    }

    if (onlyMine && myUserId) {
      out = out.filter((r) => (r.assigned_to_user_id || '') === myUserId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter((r) => r.title.toLowerCase().includes(q));
    }

    return out;
  }, [rows, assigneeFilter, priorityFilter, onlyMine, myUserId, searchQuery]);

  const boardStats = useMemo(() => {
    const openish = filteredRows.filter((r) => r.status_v2 !== 'done' && r.status_v2 !== 'cancelled');
    let overdue = 0;
    let due48 = 0;
    let noDue = 0;
    let slaAtRisk = 0;
    let slaViolated = 0;

    for (const t of openish) {
      if (!t.due_at) {
        noDue += 1;
        continue;
      }
      const due = new Date(t.due_at).getTime();
      const diffH = (due - Date.now()) / 36e5;
      if (diffH < 0) overdue += 1;
      else if (diffH <= 48) due48 += 1;

      const s = slaBadge(t as any);
      if (s?.label === 'SLA em risco') slaAtRisk += 1;
      if (s?.label === 'SLA violado') slaViolated += 1;
    }

    return {
      total: filteredRows.length,
      openish: openish.length,
      overdue,
      due48,
      noDue,
      slaAtRisk,
      slaViolated,
    };
  }, [filteredRows]);

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, TaskRow[]>();
    for (const c of COLUMNS) map.set(c.id, []);
    for (const r of filteredRows) {
      const k = (r.status_v2 || 'open') as TaskStatus;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    // sort: due_at then created_at
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        if (da !== db) return da - db;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      map.set(k, arr);
    }
    return map;
  }, [filteredRows]);

  async function setStatus(task: TaskRow, next: TaskStatus) {
    if (busyId) return;

    let patch: any = { status_v2: next };
    const nowIso = new Date().toISOString();

    if (next === 'in_progress') {
      patch.paused_at = null;
      patch.pause_reason = null;
      patch.cancelled_at = null;
      patch.cancel_reason = null;
      patch.done_at = null;
    }

    if (next === 'paused') {
      const reason = prompt('Motivo da pausa (opcional):', task.pause_reason || '') || '';
      patch.paused_at = nowIso;
      patch.pause_reason = reason.trim() || null;
    }

    if (next === 'done') {
      patch.done_at = nowIso;
      patch.paused_at = null;
      patch.pause_reason = null;
    }

    if (next === 'cancelled') {
      const reason = prompt('Motivo do cancelamento (opcional):', task.cancel_reason || '') || '';
      patch.cancelled_at = nowIso;
      patch.cancel_reason = reason.trim() || null;
    }

    setBusyId(task.id);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error: uErr } = await sb.from('tasks').update(patch).eq('id', task.id);
      if (uErr) throw new Error(uErr.message);

      // optimistic update
      setRows((prev) => prev.map((t) => (t.id === task.id ? ({ ...t, ...patch } as any) : t)));
      setBusyId(null);
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar tarefa.');
      setBusyId(null);
    }
  }

  const activeTask = useMemo(() => (activeId ? rows.find((r) => r.id === activeId) || null : null), [activeId, rows]);

  function findContainer(id: string): TaskStatus | null {
    if ((COLUMNS as any).some((c: any) => c.id === id)) return id as TaskStatus;
    const t = rows.find((r) => r.id === id);
    return (t?.status_v2 as TaskStatus) || null;
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    const from = findContainer(activeTaskId);
    const to = findContainer(overId);
    if (!from || !to) return;
    if (from === to) return;

    const task = rows.find((r) => r.id === activeTaskId);
    if (!task) return;

    // move across columns
    await setStatus(task, to);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tarefas</h1>
          <p className="text-sm text-white/60">Kanban (visão rápida).</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/tarefas" className="btn-ghost">
            Lista
          </Link>
          <button onClick={() => void load()} className="btn-ghost" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] text-white/60">Total no quadro</div>
          <div className="text-xl font-semibold text-white">{boardStats.total}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] text-white/60">Pendentes</div>
          <div className="text-xl font-semibold text-white">{boardStats.openish}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] text-white/60">Atrasadas</div>
          <div className="text-xl font-semibold text-red-200">{boardStats.overdue}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] text-white/60">Críticas (48h)</div>
          <div className="text-xl font-semibold text-amber-200">{boardStats.due48}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] text-white/60">Sem prazo</div>
          <div className="text-xl font-semibold text-white">{boardStats.noDue}</div>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="text-[11px] text-red-100/80">SLA violado</div>
          <div className="text-xl font-semibold text-red-200">{boardStats.slaViolated}</div>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <div className="text-[11px] text-amber-100/80">SLA em risco</div>
          <div className="text-xl font-semibold text-amber-200">{boardStats.slaAtRisk}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Prioridade</div>
          <select className="select !mt-1 !w-full" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)}>
            <option value="all">Todas</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Filtrar por responsável</div>
          <select className="select !mt-1 !w-full" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="all">Todos</option>
            {profiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {profileLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Buscar por título</div>
          <input
            className="input !mt-1"
            placeholder="Ex.: petição, audiência..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Atalho</div>
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Somente minhas tarefas
          </label>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={(e) => void onDragEnd(e)}
      >
        <div className="grid gap-4 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const list = byStatus.get(col.id) || [];
            const ids = list.map((t) => t.id);

            return (
              <KanbanColumn key={col.id} id={col.id}>
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{col.label}</div>
                      <div className="text-xs text-white/50">{list.length} tarefa(s)</div>
                    </div>
                  </div>

                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <div className="mt-3 grid gap-2">
                      {loading ? <div className="text-sm text-white/60">Carregando…</div> : null}

                      {!loading && !list.length ? <div className="text-sm text-white/60">—</div> : null}

                      {list.map((t) => {
                        const due = dueBadge(t);
                        const sla = slaBadge(t);
                        const stale = staleBadge(t);
                        const assignee = t.assigned_to_user_id ? profileMap.get(t.assigned_to_user_id) : null;
                        const client = t.client_id ? clientsMap.get(t.client_id) : null;
                        const kase = t.case_id ? casesMap.get(t.case_id) : null;

                        return (
                          <KanbanCard key={t.id} id={t.id} disabled={busyId === t.id}>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <Link to={`/app/tarefas/${t.id}`} className="text-sm font-semibold text-white hover:underline">
                                  {t.title}
                                </Link>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {due ? <span className={due.cls}>{due.label}</span> : null}
                                  {stale ? <span className={stale.cls}>{stale.label}</span> : null}
                                </div>
                              </div>

                              {sla ? <div className="mt-2"><span className={sla.cls}>{sla.label}</span></div> : null}

                              <div className="mt-2 text-xs text-white/60">
                                <div>
                                  Responsável:{' '}
                                  {assignee
                                    ? profileLabel(assignee)
                                    : t.assigned_to_user_id
                                      ? t.assigned_to_user_id.slice(0, 8)
                                      : '—'}
                                </div>
                                {client ? <div>Cliente: {client.name}</div> : null}
                                {kase ? <div>Caso: {kase.title}</div> : null}
                                {t.due_at ? <div>Prazo: {fmtDT(t.due_at)}</div> : null}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                                  disabled={busyId === t.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void setStatus(t, 'in_progress');
                                  }}
                                >
                                  Start
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                                  disabled={busyId === t.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void setStatus(t, 'paused');
                                  }}
                                >
                                  Pausar
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                                  disabled={busyId === t.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void setStatus(t, 'done');
                                  }}
                                >
                                  Concluir
                                </button>
                                {isAdmin ? (
                                  <>
                                    <Link
                                      to={`/app/tarefas/${t.id}?delegate=1`}
                                      className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                    >
                                      Delegar
                                    </Link>
                                    <button
                                      type="button"
                                      className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                                      disabled={busyId === t.id}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void setStatus(t, 'cancelled');
                                      }}
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                ) : null}
                              </div>

                              <div className="mt-2 text-[11px] text-white/40">Status: {t.status_v2}</div>
                            </div>
                          </KanbanCard>
                        );
                      })}
                    </div>
                  </SortableContext>
                </Card>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="rounded-2xl border border-white/10 bg-neutral-950/90 p-3">
              <div className="text-sm font-semibold text-white">{activeTask.title}</div>
              <div className="mt-1 text-xs text-white/60">Arraste para mover de coluna</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
