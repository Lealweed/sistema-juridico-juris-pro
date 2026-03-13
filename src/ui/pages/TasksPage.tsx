import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
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
  description: string | null;
  priority: 'low' | 'medium' | 'high' | string;

  status_v2: TaskStatus;
  due_at: string | null;

  created_by_user_id: string | null;
  assigned_to_user_id: string | null;

  last_assigned_by_user_id: string | null;
  last_assigned_at: string | null;

  client_id: string | null;
  case_id: string | null;

  done_at: string | null;
  completed_by_user_id: string | null;

  paused_at: string | null;
  pause_reason: string | null;

  cancelled_at: string | null;
  cancel_reason: string | null;

  created_at: string;
  task_group_id?: string | null;
};

function fmtDT(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
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

function toIsoFromDatetimeLocal(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function profileLabel(p: Profile) {
  return p.display_name || p.email || p.user_id;
}

export function TasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [delegatingId, setDelegatingId] = useState<string | null>(null);
  const [delegateTo, setDelegateTo] = useState('');
  const [myUserId, setMyUserId] = useState<string>('');
  const [role, setRole] = useState<string>('');

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [cases, setCases] = useState<CaseLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<TaskStatus | 'all' | 'delegated'>('open');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueAtLocal, setDueAtLocal] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [multi, setMulti] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);

  const [teamOpen, setTeamOpen] = useState(false);
  const [teamUserIds, setTeamUserIds] = useState<string[]>([]);
  const [teamRoles, setTeamRoles] = useState<Record<string, string>>({});
  const [clientId, setClientId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [saving, setSaving] = useState(false);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p] as const)), [profiles]);
  const isAdmin = role === 'admin';
  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c] as const)), [clients]);
  const casesMap = useMemo(() => new Map(cases.map((c) => [c.id, c] as const)), [cases]);

  async function ensureMyProfile() {
    const sb = requireSupabase();
    const user = await getAuthedUser();
    setMyUserId(user.id);

    // role (admin can manage team tasks)
    try {
      const r = await getMyOfficeRole();
      setRole(r);
    } catch {
      setRole('');
    }

    // best-effort upsert profile (so we can show names/emails)
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

    // Load profiles that the current user can see (own + office members when office_id exists)
    try {
      const { data } = await sb
        .from('user_profiles')
        .select('user_id,display_name,email,office_id')
        .order('created_at', { ascending: false })
        .limit(200);
      setProfiles((data || []) as Profile[]);
    } catch {
      setProfiles([]);
    }

    // set default assignedTo = me
    setAssignedTo((prev) => prev || user.id);
    setAssignees((prev) => (prev.length ? prev : [user.id]));  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const [{ data, error: qErr }, clientsLite, casesLite] = await Promise.all([
        sb
          .from('tasks')
          .select(
            'id,title,description,priority,status_v2,due_at,created_by_user_id,assigned_to_user_id,last_assigned_by_user_id,last_assigned_at,client_id,case_id,done_at,completed_by_user_id,paused_at,pause_reason,cancelled_at,cancel_reason,created_at,task_group_id',
          )
          .order('created_at', { ascending: false })
          .limit(500),
        loadClientsLite().catch(() => [] as ClientLite[]),
        loadCasesLite().catch(() => [] as CaseLite[]),
      ]);

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as TaskRow[]);
      setClients(clientsLite);
      setCases(casesLite);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar tarefas.');
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await ensureMyProfile();
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let out = rows;

    if (filter === 'delegated') {
      out = out.filter(
        (r) => r.last_assigned_by_user_id === myUserId && (r.assigned_to_user_id || '') !== myUserId,
      );
    } else if (filter !== 'all') {
      out = out.filter((r) => r.status_v2 === filter);
    }

    if (isAdmin && assigneeFilter !== 'all') {
      out = out.filter((r) => (r.assigned_to_user_id || '') === assigneeFilter);
    }

    return out;
  }, [rows, filter, isAdmin, assigneeFilter]);

  const stats = useMemo(() => {
    const openish = rows.filter((r) => r.status_v2 !== 'done' && r.status_v2 !== 'cancelled');
    const overdue = openish.filter((r) => {
      const b = dueBadge(r as any);
      return b?.label === 'Atrasada';
    });
    const due48 = openish.filter((r) => {
      const b = dueBadge(r as any);
      return b?.label === 'Vence hoje' || b?.label === 'Vence em 48h';
    });

    const byAssignee = new Map<string, { total: number; overdue: number; due48: number }>();
    for (const r of openish) {
      const key = r.assigned_to_user_id || '—';
      const cur = byAssignee.get(key) || { total: 0, overdue: 0, due48: 0 };
      cur.total += 1;
      const b = dueBadge(r as any);
      if (b?.label === 'Atrasada') cur.overdue += 1;
      if (b?.label === 'Vence hoje' || b?.label === 'Vence em 48h') cur.due48 += 1;
      byAssignee.set(key, cur);
    }

    return { overdue: overdue.length, due48: due48.length, byAssignee };
  }, [rows]);

  async function onCreate() {
    if (!title.trim()) return;

    const dueIso = dueAtLocal ? toIsoFromDatetimeLocal(dueAtLocal) : null;
    if (dueAtLocal && !dueIso) {
      setError('Prazo inválido.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      const targets = isAdmin && multi ? (assignees.length ? assignees : [assignedTo || user.id]) : [assignedTo || user.id];
      const groupId = isAdmin && multi && targets.length > 1 ? crypto.randomUUID() : null;

      const payload = targets.map((uid) => ({
        user_id: user.id,
        created_by_user_id: user.id,
        assigned_to_user_id: uid,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status_v2: 'open',
        due_at: dueIso,
        client_id: clientId || null,
        case_id: caseId || null,
        task_group_id: groupId,
      }));

      const { data: inserted, error: iErr } = await sb
        .from('tasks')
        .insert(payload as any)
        .select('id,office_id,assigned_to_user_id');
      if (iErr) throw new Error(iErr.message);

      // Optional: add team participants (admin)
      if (isAdmin) {
        const insertedRows = (inserted || []) as any[];

        // Ensure assigned user is also a participant for each created task
        for (const tr of insertedRows) {
          if (tr?.id && tr?.assigned_to_user_id) {
            await sb.rpc('task_add_participant', {
              p_task_id: tr.id,
              p_user_id: tr.assigned_to_user_id,
              p_role: 'assignee',
            } as any);
          }
        }

        if (teamOpen && teamUserIds.length) {
          for (const tr of insertedRows) {
            for (const uid of teamUserIds) {
              const role = teamRoles[uid] || 'reviewer';
              await sb.rpc('task_add_participant', {
                p_task_id: tr.id,
                p_user_id: uid,
                p_role: role,
              } as any);
            }
          }
        }
      }

      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setTeamOpen(false);
      setTeamUserIds([]);
      setTeamRoles({});
      setPriority('medium');
      setDueAtLocal('');
      setAssignedTo(user.id);
      setMulti(false);
      setAssignees([user.id]);
      setClientId('');
      setCaseId('');
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar tarefa.');
      setSaving(false);
    }
  }

  async function updateTask(id: string, patch: Partial<TaskRow>) {
    const sb = requireSupabase();
    await getAuthedUser();
    const { error: uErr } = await sb.from('tasks').update(patch as any).eq('id', id);
    if (uErr) throw new Error(uErr.message);
  }

  async function markDone(t: TaskRow) {
    try {
      const user = await getAuthedUser();
      await updateTask(t.id, {
        status_v2: 'done',
        done_at: new Date().toISOString(),
        completed_by_user_id: user.id,
      } as any);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao concluir tarefa.');
    }
  }

  async function pauseTask(t: TaskRow) {
    const reason = prompt('Motivo da pausa:');
    if (!reason?.trim()) return;

    try {
      await updateTask(t.id, {
        status_v2: 'paused',
        paused_at: new Date().toISOString(),
        pause_reason: reason.trim(),
      } as any);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao pausar tarefa.');
    }
  }

  async function cancelTask(t: TaskRow) {
    const reason = prompt('Motivo do cancelamento:');
    if (!reason?.trim()) return;

    try {
      await updateTask(t.id, {
        status_v2: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason.trim(),
      } as any);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao cancelar tarefa.');
    }
  }

  async function startTask(t: TaskRow) {
    try {
      await updateTask(t.id, { status_v2: 'in_progress' } as any);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao iniciar tarefa.');
    }
  }

  async function delegateTask(t: TaskRow, toUserId: string) {
    if (!toUserId) return;

    setDelegatingId(t.id);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error } = await sb.rpc('delegate_task', {
        p_task_id: t.id,
        p_assigned_to_user_id: toUserId,
      } as any);

      if (error) throw new Error(error.message);

      setDelegatingId(null);
      setDelegateTo('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao delegar tarefa.');
      setDelegatingId(null);
    }
  }

  async function reopenTask(t: TaskRow) {
    try {
      await updateTask(t.id, {
        status_v2: 'open',
        done_at: null,
        completed_by_user_id: null,
        cancelled_at: null,
        cancel_reason: null,
        paused_at: null,
        pause_reason: null,
      } as any);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao reabrir tarefa.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tarefas</h1>
          <p className="text-sm text-white/60">Criada por / Executada por · prazos · pausas/cancelamentos com motivo.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/tarefas/kanban" className="btn-ghost">
            Kanban
          </Link>
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            Nova tarefa
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Críticas (48h): <span className="text-amber-200">{stats.due48}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Atrasadas: <span className="text-red-200">{stats.overdue}</span>
            </div>

            <select
              className="select !mt-0 !w-[240px]"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              title="Filtrar por responsável"
            >
              <option value="all">Equipe (todos)</option>
              {profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {profileLabel(p)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {(
          [
            { id: 'open', label: 'Abertas' },
            { id: 'in_progress', label: 'Em andamento' },
            { id: 'paused', label: 'Pausadas' },
            { id: 'done', label: 'Concluídas' },
            { id: 'cancelled', label: 'Canceladas' },
            { id: 'delegated', label: 'Delegadas' },
            { id: 'all', label: 'Todas' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={
              'rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold ' +
              (filter === t.id ? 'bg-white text-neutral-950' : 'bg-white/5 text-white/80 hover:bg-white/10')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Nova tarefa</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="md:col-span-2 text-sm text-white/80">
                Título
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Prioridade
                <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>

              <label className="md:col-span-2 text-sm text-white/80">
                Descrição
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Prazo (data e hora)
                <input
                  type="datetime-local"
                  className="input"
                  value={dueAtLocal}
                  onChange={(e) => setDueAtLocal(e.target.value)}
                />
              </label>

              <label className="md:col-span-3 text-sm text-white/80">
                Cliente (opcional)
                <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Sem cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="md:col-span-3 text-sm text-white/80">
                Caso/Processo (opcional)
                <select className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                  <option value="">Sem caso</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.client?.[0]?.name ? ` — ${c.client[0].name}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="md:col-span-3 text-sm text-white/80">
                Executada por
                <select
                  className="select"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                >
                  {(profiles.length ? profiles : [{ user_id: myUserId, display_name: null, email: null, office_id: null }]).map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {profileLabel(p)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-3 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Delegar para mais de 1 pessoa</div>
                        <div className="text-xs text-white/60">O sistema cria 1 tarefa por responsável (cada um responde a sua).</div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-white/80">
                        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                        Ativar
                      </label>
                    </div>

                    {multi ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {profiles.map((p) => (
                          <label key={p.user_id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80">
                            <input
                              type="checkbox"
                              checked={assignees.includes(p.user_id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAssignees((curr) => {
                                  if (checked) return Array.from(new Set([...curr, p.user_id]));
                                  return curr.filter((x) => x !== p.user_id);
                                });
                              }}
                            />
                            {profileLabel(p)}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Equipe da tarefa (opcional)</div>
                        <div className="text-xs text-white/60">Adiciona participantes extras (revisor, protocolo etc.).</div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-white/80">
                        <input type="checkbox" checked={teamOpen} onChange={(e) => setTeamOpen(e.target.checked)} />
                        Ativar
                      </label>
                    </div>

                    {teamOpen ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {profiles.map((p) => {
                          const checked = teamUserIds.includes(p.user_id);
                          const role = teamRoles[p.user_id] || 'reviewer';

                          return (
                            <div
                              key={p.user_id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                            >
                              <label className="flex items-center gap-2 text-sm text-white/80">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const on = e.target.checked;
                                    setTeamUserIds((curr) => {
                                      if (on) return Array.from(new Set([...curr, p.user_id]));
                                      return curr.filter((x) => x !== p.user_id);
                                    });
                                    setTeamRoles((curr) => ({ ...curr, [p.user_id]: curr[p.user_id] || 'reviewer' }));
                                  }}
                                />
                                {profileLabel(p)}
                              </label>

                              {checked ? (
                                <select
                                  className="select !mt-0 !w-[140px]"
                                  value={role}
                                  onChange={(e) => setTeamRoles((curr) => ({ ...curr, [p.user_id]: e.target.value }))}
                                >
                                  <option value="assignee">Responsável</option>
                                  <option value="reviewer">Revisor</option>
                                  <option value="protocol">Protocolo</option>
                                </select>
                              ) : (
                                <div className="w-[140px]" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
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
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {!loading && filtered.length === 0 ? <div className="text-sm text-white/60">Nenhuma tarefa.</div> : null}

        {!loading && filtered.length ? (
          <div className="grid gap-2">
            {filtered.map((t) => {
              const createdBy = t.created_by_user_id ? profileMap.get(t.created_by_user_id) : null;
              const assignedToP = t.assigned_to_user_id ? profileMap.get(t.assigned_to_user_id) : null;
              const client = t.client_id ? clientsMap.get(t.client_id) : null;
              const kase = t.case_id ? casesMap.get(t.case_id) : null;

              return (
                <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/app/tarefas/${t.id}`} className="text-sm font-semibold text-white hover:underline">
                          {t.title}
                        </Link>
                        {isAdmin && t.task_group_id ? (
                          <Link
                            to={`/app/tarefas/lote/${t.task_group_id}`}
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
                            title="Abrir lote"
                          >
                            Lote
                          </Link>
                        ) : null}
                      </div>
                      {t.description ? <div className="mt-1 text-xs text-white/60">{t.description}</div> : null}

                      <div className="mt-2 text-xs text-white/50">
                        Status: <span className="badge">{t.status_v2}</span> · Prioridade: {t.priority}{' '}
                        {(() => {
                          const b = dueBadge(t);
                          return b ? <span className={"ml-2 " + b.cls}>{b.label}</span> : null;
                        })()}
                      </div>
                      <div className="mt-1 text-xs text-white/50">Prazo: {fmtDT(t.due_at)}</div>

                      {client ? (
                        <div className="mt-1 text-xs text-white/50">
                          Cliente:{' '}
                          <Link className="link-accent" to={`/app/clientes/${client.id}`}>
                            {client.name}
                          </Link>
                        </div>
                      ) : null}

                      {kase ? (
                        <div className="mt-1 text-xs text-white/50">
                          Caso:{' '}
                          <Link className="link-accent" to={`/app/casos/${kase.id}`}>
                            {kase.title}
                          </Link>
                        </div>
                      ) : null}

                      <div className="mt-1 text-xs text-white/50">
                        Criada por: {createdBy ? profileLabel(createdBy) : t.created_by_user_id || '—'} · Executada por:{' '}
                        {assignedToP ? profileLabel(assignedToP) : t.assigned_to_user_id || '—'}
                      </div>
                      <div className="mt-1 text-xs text-white/50">Finalizada em: {fmtDT(t.done_at)}</div>

                      {t.status_v2 === 'paused' ? (
                        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
                          Pausada em: {fmtDT(t.paused_at)} · Motivo: {t.pause_reason || '—'}
                        </div>
                      ) : null}

                      {t.status_v2 === 'cancelled' ? (
                        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
                          Cancelada em: {fmtDT(t.cancelled_at)} · Motivo: {t.cancel_reason || '—'}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {t.status_v2 === 'open' ? (
                        <button onClick={() => void startTask(t)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                          Iniciar
                        </button>
                      ) : null}

                      {t.status_v2 === 'in_progress' || t.status_v2 === 'open' ? (
                        <button onClick={() => void pauseTask(t)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                          Pausar
                        </button>
                      ) : null}

                      {t.status_v2 !== 'done' && t.status_v2 !== 'cancelled' ? (
                        <button onClick={() => void markDone(t)} className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs">
                          Concluir
                        </button>
                      ) : null}

                      {t.status_v2 !== 'cancelled' && t.status_v2 !== 'done' ? (
                        <button onClick={() => void cancelTask(t)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                          Cancelar
                        </button>
                      ) : null}

                      {isAdmin ? (
                        <select
                          className="select !mt-0 !w-[200px]"
                          value={delegatingId === t.id ? delegateTo : ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDelegateTo(v);
                            if (v) void delegateTask(t, v);
                          }}
                          disabled={delegatingId === t.id}
                          title="Delegar"
                        >
                          <option value="">Delegar…</option>
                          {profiles.map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {profileLabel(p)}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {t.status_v2 === 'done' || t.status_v2 === 'cancelled' ? (
                        <button onClick={() => void reopenTask(t)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                          Reabrir
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
