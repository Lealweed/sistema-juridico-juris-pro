import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { TaskAttachmentsSection } from '@/ui/widgets/TaskAttachmentsSection';
import { TimelineSection } from '@/ui/widgets/TimelineSection';
import { getMyOfficeRole } from '@/lib/roles';
import { listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status_v2: string | null;
  priority: string;
  due_at: string | null;
  created_at: string;
  assigned_to_user_id: string | null;
  last_assigned_by_user_id?: string | null;
  last_assigned_at?: string | null;
  client_id: string | null;
  case_id: string | null;
  office_id?: string | null;
  subtasks?: TaskSubtask[] | null;
  client?: { id: string; name: string }[] | null;
  case_rel?: { id: string; title: string }[] | null;
};

type TaskSubtask = {
  id: string;
  title: string;
  assignee_id: string;
  is_done: boolean;
  doneAt: string | null;
  doneByUserId: string | null;
};

type Participant = {
  id: string;
  task_id: string;
  user_id: string;
  role: string;
  status: string;
  conclusion_notes: string | null;
  concluded_at: string | null;
  profile?: { display_name: string | null; email: string | null } | null;
};

function normalizeSubtasks(input: unknown): TaskSubtask[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const data = item as Record<string, unknown>;
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      const assigneeId =
        typeof data.assignee_id === 'string'
          ? data.assignee_id
          : typeof data.responsibleUserId === 'string'
            ? data.responsibleUserId
            : '';
      if (!title || !assigneeId) return null;

      return {
        id: typeof data.id === 'string' && data.id ? data.id : crypto.randomUUID(),
        title,
        assignee_id: assigneeId,
        is_done: data.is_done === true || data.done === true,
        doneAt: typeof data.doneAt === 'string' ? data.doneAt : null,
        doneByUserId: typeof data.doneByUserId === 'string' ? data.doneByUserId : null,
      } satisfies TaskSubtask;
    })
    .filter((item): item is TaskSubtask => Boolean(item));
}

function areSubtasksComplete(subtasks: TaskSubtask[] | null | undefined) {
  if (!subtasks?.length) return true;
  return subtasks.every((subtask) => subtask.is_done);
}

function initialsFromLabel(label: string) {
  return (
    label
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '??'
  );
}

function fmtDT(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function TaskDetailsPage() {
  const { taskId } = useParams();
  const [sp] = useSearchParams();
  const [row, setRow] = useState<TaskRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editDueAt, setEditDueAt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [myNotes, setMyNotes] = useState('');
  const [savingPart, setSavingPart] = useState(false);

  const [role, setRole] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [members, setMembers] = useState<OfficeMemberProfile[]>([]);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');
  const [delegating, setDelegating] = useState(false);

  const isAdmin = role === 'admin';

  const [addPartUserId, setAddPartUserId] = useState('');
  const [addPartRole, setAddPartRole] = useState<'assignee' | 'reviewer' | 'protocol' | string>('assignee');
  const [addingPart, setAddingPart] = useState(false);
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [savingSubtasks, setSavingSubtasks] = useState(false);
  const [subtaskModalOpen, setSubtaskModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState('');

  async function onAddParticipant() {
    if (!row) return;
    if (!addPartUserId) {
      setError('Selecione um membro para adicionar.');
      return;
    }

    setAddingPart(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error } = await sb.rpc('task_add_participant', {
        p_task_id: row.id,
        p_user_id: addPartUserId,
        p_role: addPartRole || 'assignee',
      });

      if (error) throw new Error(error.message);

      setAddPartUserId('');
      setAddPartRole('assignee');
      setAddingPart(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao adicionar participante.');
      setAddingPart(false);
    }
  }

  async function onDelegate() {
    if (!row) return;
    if (!delegateTo) {
      setError('Selecione para quem delegar.');
      return;
    }

    setDelegating(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error } = await sb.rpc('delegate_task', {
        p_task_id: row.id,
        p_assigned_to_user_id: delegateTo,
      });

      if (error) throw new Error(error.message);

      setDelegateOpen(false);
      setDelegateTo('');
      setDelegating(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao delegar.');
      setDelegating(false);
    }
  }

  async function load() {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      setMyUserId(user.id);

      const { data, error: qErr } = await sb
        .from('tasks')
        .select(
          'id,office_id,title,description,status_v2,priority,due_at,created_at,client_id,case_id,assigned_to_user_id,last_assigned_by_user_id,last_assigned_at,subtasks, client:clients(id,name), case_rel:cases(id,title)',
        )
        .eq('id', taskId)
        .maybeSingle();

      if (qErr) throw new Error(qErr.message);
      const t = data ? ({ ...data, subtasks: normalizeSubtasks((data as TaskRow).subtasks) } as TaskRow) : null;
      setRow(t);
      setSubtasks(normalizeSubtasks(t?.subtasks));
      setEditTitle(t?.title || '');
      setEditDescription(t?.description || '');
      setEditPriority(t?.priority || 'medium');
      setEditDueAt(t?.due_at ? t.due_at.slice(0, 16) : '');

      const r = await getMyOfficeRole().catch(() => '');
      setRole(r);

      if (t?.office_id) {
        const ms = await listOfficeMemberProfiles(t.office_id).catch(() => []);
        setMembers(ms);
      }

      // participants + profiles
      const { data: ps, error: pErr } = await sb
        .from('task_participants')
        .select('id,task_id,user_id,role,status,conclusion_notes,concluded_at,office_id')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (pErr) throw new Error(pErr.message);

      const list = (ps || []) as Participant[];
      const userIds = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean)));

      let profMap = new Map<string, any>();
      if (userIds.length) {
        const { data: profs } = await sb.from('user_profiles').select('user_id,email,display_name').in('user_id', userIds).limit(500);
        profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));
      }

      setParticipants(
        list.map((p) => ({
          ...p,
          profile: profMap.get(p.user_id) ? { email: profMap.get(p.user_id).email ?? null, display_name: profMap.get(p.user_id).display_name ?? null } : null,
        })) as Participant[],
      );

      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar tarefa.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (sp.get('delegate') === '1') setDelegateOpen(true);
  }, [sp]);

  const subtasksComplete = areSubtasksComplete(subtasks);

  async function persistSubtasks(nextSubtasks: TaskSubtask[]) {
    if (!row?.id) return;

    setSavingSubtasks(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const normalized = normalizeSubtasks(nextSubtasks);
      const { error: updateErr } = await sb.from('tasks').update({ subtasks: normalized }).eq('id', row.id);
      if (updateErr) throw new Error(updateErr.message);

      const uniqueUsers = Array.from(new Set(normalized.map((subtask) => subtask.assignee_id).filter(Boolean)));
      for (const userId of uniqueUsers) {
        await sb.rpc('task_add_participant', {
          p_task_id: row.id,
          p_user_id: userId,
          p_role: userId === row.assigned_to_user_id ? 'assignee' : 'reviewer',
        });
      }

      setSubtasks(normalized);
      setRow((prev) => (prev ? { ...prev, subtasks: normalized } : prev));
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar etapas da tarefa.');
    } finally {
      setSavingSubtasks(false);
    }
  }

  async function toggleSubtaskDone(subtaskId: string) {
    const target = subtasks.find((subtask) => subtask.id === subtaskId);
    if (!target) return;

    const canToggle = isAdmin || target.assignee_id === myUserId;
    if (!canToggle) {
      setError('Somente o responsável da etapa ou um sócio/admin pode concluí-la.');
      return;
    }

    const nowIso = new Date().toISOString();
    const next = subtasks.map((subtask) =>
      subtask.id === subtaskId
        ? {
            ...subtask,
            is_done: !subtask.is_done,
            doneAt: !subtask.is_done ? nowIso : null,
            doneByUserId: !subtask.is_done ? myUserId : null,
          }
        : subtask,
    );

    await persistSubtasks(next);
  }

  async function addSubtask() {
    const title = newSubtaskTitle.trim();
    if (!title || !newSubtaskAssigneeId) {
      setError('Informe o nome da etapa e o responsável.');
      return;
    }

    const next = [
      ...subtasks,
      {
        id: crypto.randomUUID(),
        title,
        assignee_id: newSubtaskAssigneeId,
        is_done: false,
        doneAt: null,
        doneByUserId: null,
      },
    ];

    await persistSubtasks(next);
    setSubtaskModalOpen(false);
    setNewSubtaskTitle('');
    setNewSubtaskAssigneeId(row?.assigned_to_user_id || myUserId || '');
  }

  async function markTaskDone() {
    if (!row?.id) return;
    if (!subtasksComplete) {
      setError('Todas as etapas da equipe precisam ser concluídas primeiro.');
      window.alert('Todas as etapas da equipe precisam ser concluídas primeiro.');
      return;
    }

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      const { error: updateErr } = await sb
        .from('tasks')
        .update({
          status_v2: 'done',
          done_at: new Date().toISOString(),
          completed_by_user_id: user.id,
          paused_at: null,
          pause_reason: null,
        })
        .eq('id', row.id);
      if (updateErr) throw new Error(updateErr.message);

      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao concluir tarefa.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tarefa</h1>
          <p className="text-sm text-white/60">Detalhes e anexos.</p>
        </div>
        <Link to="/app/tarefas" className="btn-ghost">
          Voltar
        </Link>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}

        {!loading && row ? (
          <div className="grid gap-4">
            {editing ? (
              <>
                <label className="text-sm text-white/80">
                  Título
                  <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </label>
                <label className="text-sm text-white/80">
                  Descrição
                  <textarea className="input min-h-[80px]" value={editDescription} onChange={e => setEditDescription(e.target.value)} />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    Prioridade
                    <select className="input" value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                  <label className="text-sm text-white/80">
                    Prazo
                    <input type="datetime-local" className="input" value={editDueAt} onChange={e => setEditDueAt(e.target.value)} />
                  </label>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    className="btn-primary"
                    disabled={savingEdit}
                    onClick={async () => {
                      if (!row?.id) return;
                      setSavingEdit(true);
                      setError(null);
                      try {
                        const sb = requireSupabase();
                        await getAuthedUser();
                        const dueIso = editDueAt ? new Date(editDueAt).toISOString() : null;
                        const { error: updateErr } = await sb.from('tasks').update({
                          title: editTitle.trim(),
                          description: editDescription.trim() || null,
                          priority: editPriority,
                          due_at: dueIso,
                        }).eq('id', row.id);
                        if (updateErr) throw new Error(updateErr.message);
                        setEditing(false);
                        await load();
                      } catch (e: any) {
                        setError(e?.message || 'Falha ao salvar alterações.');
                      } finally {
                        setSavingEdit(false);
                      }
                    }}
                  >
                    {savingEdit ? 'Salvando…' : 'Salvar Alterações'}
                  </button>
                  <button className="btn-ghost" disabled={savingEdit} onClick={() => setEditing(false)}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-white/50">Título</div>
                  <div className="text-lg font-semibold text-white">{row.title}</div>
                </div>
                {row.description ? (
                  <div>
                    <div className="text-xs text-white/50">Descrição</div>
                    <div className="text-sm text-white/80">{row.description}</div>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-white/50">Status</div>
                    <div className="text-sm text-white/80">{row.status_v2 || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Prioridade</div>
                    <div className="text-sm text-white/80">{row.priority}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Prazo</div>
                    <div className="text-sm text-white/80">{fmtDT(row.due_at)}</div>
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-white/50">Cliente</div>
                {row.client?.[0] ? (
                  <Link className="link-accent" to={`/app/clientes/${row.client[0].id}`}>
                    {row.client[0].name}
                  </Link>
                ) : (
                  <div className="text-sm text-white/70">—</div>
                )}
              </div>
              <div>
                <div className="text-xs text-white/50">Caso</div>
                {row.case_rel?.[0] ? (
                  <Link className="link-accent" to={`/app/casos/${row.case_rel[0].id}`}>
                    {row.case_rel[0].title}
                  </Link>
                ) : (
                  <div className="text-sm text-white/70">—</div>
                )}
              </div>
            </div>

            <div className="text-xs text-white/40">Criada em: {fmtDT(row.created_at)}</div>

            <div className="flex flex-wrap items-center gap-2">
              {!editing && (
                <button className="btn-ghost" onClick={() => {
                  setEditing(true);
                  setEditTitle(row.title);
                  setEditDescription(row.description || '');
                  setEditPriority(row.priority || 'medium');
                  setEditDueAt(row.due_at ? row.due_at.slice(0, 16) : '');
                }}>
                  ✏️ Editar
                </button>
              )}
              {isAdmin ? (
                <button className="btn-ghost" onClick={() => setDelegateOpen((v) => !v)}>
                  {delegateOpen ? 'Fechar delegação' : 'Delegar'}
                </button>
              ) : null}
              <div
                onClick={() => {
                  if (row.status_v2 !== 'done' && row.status_v2 !== 'cancelled' && !subtasksComplete) {
                    setError('Todas as etapas da equipe precisam ser concluídas primeiro.');
                    window.alert('Todas as etapas da equipe precisam ser concluídas primeiro.');
                  }
                }}
              >
                <button
                  className={
                    subtasksComplete
                      ? 'btn-primary'
                      : 'inline-flex items-center justify-center rounded-lg bg-neutral-700 px-4 py-2 text-sm font-semibold text-white/70'
                  }
                  onClick={() => void markTaskDone()}
                  disabled={row.status_v2 === 'done' || row.status_v2 === 'cancelled' || !subtasksComplete}
                  title={!subtasksComplete ? 'Todas as etapas da equipe precisam ser concluídas primeiro' : 'Mover tarefa para concluído'}
                >
                  Mover para Concluído
                </button>
              </div>
            </div>

            {!subtasksComplete ? (
              <div className="text-sm text-amber-200">Todas as etapas da equipe precisam ser concluídas primeiro.</div>
            ) : null}

            {isAdmin && delegateOpen ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Delegar tarefa</div>
                <div className="mt-1 text-xs text-white/60">Atribui a tarefa para outro membro e registra na caixa de saída.</div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    Delegar para
                    <select className="select" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
                      <option value="">Selecione…</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email || m.user_id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={delegating} onClick={() => void onDelegate()}>
                    {delegating ? 'Delegando…' : 'Confirmar delegação'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {!loading && row ? (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Etapas / Subtarefas</div>
              <div className="text-xs text-white/60">A tarefa mãe funciona como uma pasta. Cada etapa pertence a um membro da equipe.</div>
            </div>
            <button
              type="button"
              className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
              disabled={savingSubtasks}
              onClick={() => {
                setNewSubtaskTitle('');
                setNewSubtaskAssigneeId(row.assigned_to_user_id || myUserId || members[0]?.user_id || '');
                setSubtaskModalOpen(true);
              }}
            >
              + Adicionar Etapa
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {subtasks.map((subtask) => {
              const canToggle = isAdmin || subtask.assignee_id === myUserId;
              const responsible = members.find((member) => member.user_id === subtask.assignee_id);
              const responsibleLabel = responsible?.display_name || responsible?.email || subtask.assignee_id.slice(0, 8);
              return (
                <div key={subtask.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <label className="flex items-center gap-3 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={subtask.is_done}
                        disabled={savingSubtasks}
                        onChange={() => {
                          if (!canToggle) {
                            setError('Somente o responsável da etapa ou um sócio/admin pode concluí-la.');
                            window.alert('Somente o responsável da etapa ou um sócio/admin pode concluí-la.');
                            return;
                          }
                          void toggleSubtaskDone(subtask.id);
                        }}
                      />
                      <span className="text-xs text-white/60">Concluir etapa</span>
                    </label>

                    <div>
                      <div className="text-sm font-semibold text-white">{subtask.title}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {subtask.doneAt ? `Concluída em ${fmtDT(subtask.doneAt)}` : 'Pendente'}
                        {!canToggle ? ' · somente o responsável ou admin pode marcar' : ''}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300 text-xs font-semibold text-black">
                          {initialsFromLabel(responsibleLabel)}
                        </div>
                        <div className="text-sm text-white/80">{responsibleLabel}</div>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost !rounded-lg !px-3 !py-2 !text-xs"
                        disabled={savingSubtasks}
                        onClick={() => void persistSubtasks(subtasks.filter((item) => item.id !== subtask.id))}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!subtasks.length ? <div className="text-sm text-white/60">Nenhuma etapa cadastrada.</div> : null}
          </div>
        </Card>
      ) : null}

      {subtaskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#11151c] p-5 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white">Nova etapa</div>
                <div className="mt-1 text-sm text-white/60">Defina o nome da etapa e o responsável da equipe.</div>
              </div>
              <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setSubtaskModalOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-sm text-white/80">
                Nome da Etapa
                <input
                  className="input"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Ex.: Revisar petição"
                />
              </label>

              <label className="text-sm text-white/80">
                Responsável
                <select className="select" value={newSubtaskAssigneeId} onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name || member.email || member.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setSubtaskModalOpen(false)} disabled={savingSubtasks}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => void addSubtask()} disabled={savingSubtasks}>
                {savingSubtasks ? 'Salvando...' : 'Adicionar Etapa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && row ? (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Equipe da tarefa</div>
              <div className="text-xs text-white/60">Cada participante pode registrar sua própria conclusão.</div>
            </div>
          </div>

          {isAdmin ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Adicionar participante</div>
              <div className="mt-1 text-xs text-white/60">Adiciona (ou atualiza o papel) de um membro na tarefa.</div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-white/80">
                  Membro
                  <select className="select" value={addPartUserId} onChange={(e) => setAddPartUserId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email || m.user_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-white/80">
                  Papel
                  <select className="select" value={addPartRole} onChange={(e) => setAddPartRole(e.target.value)}>
                    <option value="assignee">Responsável</option>
                    <option value="reviewer">Revisor</option>
                    <option value="protocol">Protocolo</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={addingPart} onClick={() => void onAddParticipant()}>
                  {addingPart ? 'Adicionando…' : 'Adicionar'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            {participants.map((p) => {
              const name = p.profile?.display_name || p.profile?.email || p.user_id.slice(0, 8);
              return (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{name}</div>
                      <div className="mt-1 text-xs text-white/60">
                        {p.role} · status: <span className="badge">{p.status}</span>
                        {p.concluded_at ? ` · concluído em ${fmtDT(p.concluded_at)}` : ''}
                      </div>
                    </div>
                  </div>

                  {p.conclusion_notes ? (
                    <div className="mt-2 text-sm text-white/80">
                      <div className="text-xs text-white/50">Conclusão</div>
                      <div className="mt-1 whitespace-pre-wrap">{p.conclusion_notes}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!participants.length ? <div className="text-sm text-white/60">Nenhum participante vinculado.</div> : null}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">Minha conclusão</div>
            <div className="mt-2">
              <textarea
                className="input min-h-[100px]"
                value={myNotes}
                onChange={(e) => setMyNotes(e.target.value)}
                placeholder="Escreva aqui o que você concluiu (ex.: minuta pronta, conferido, protocolado etc.)"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={savingPart}
                onClick={async () => {
                  if (!row?.id) return;
                  setSavingPart(true);
                  setError(null);
                  try {
                    const sb = requireSupabase();
                    await getAuthedUser();
                    const { error: rErr } = await sb.rpc('task_mark_my_part_done', {
                      p_task_id: row.id,
                      p_notes: myNotes.trim() || null,
                    });
                    if (rErr) throw new Error(rErr.message);
                    setSavingPart(false);
                    await load();
                  } catch (e: any) {
                    setError(e?.message || 'Falha ao salvar sua conclusão.');
                    setSavingPart(false);
                  }
                }}
              >
                {savingPart ? 'Salvando…' : 'Marcar minha parte como concluída'}
              </button>

              <button className="btn-ghost" disabled={savingPart} onClick={() => setMyNotes('')}>
                Limpar
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {!loading && row ? (
        <TaskAttachmentsSection taskId={row.id} clientId={row.client_id} caseId={row.case_id} />
      ) : null}

      {!loading && row ? <TimelineSection taskId={row.id} clientId={row.client_id} caseId={row.case_id} /> : null}
    </div>
  );
}
