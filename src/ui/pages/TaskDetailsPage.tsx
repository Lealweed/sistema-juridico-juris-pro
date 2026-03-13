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
  client?: { id: string; name: string }[] | null;
  case?: { id: string; title: string }[] | null;
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
  const [myNotes, setMyNotes] = useState('');
  const [savingPart, setSavingPart] = useState(false);

  const [role, setRole] = useState('');
  const [members, setMembers] = useState<OfficeMemberProfile[]>([]);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');
  const [delegating, setDelegating] = useState(false);

  const isAdmin = role === 'admin';

  const [addPartUserId, setAddPartUserId] = useState('');
  const [addPartRole, setAddPartRole] = useState<'assignee' | 'reviewer' | 'protocol' | string>('assignee');
  const [addingPart, setAddingPart] = useState(false);

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
      } as any);

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
      } as any);

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
      await getAuthedUser();

      const { data, error: qErr } = await sb
        .from('tasks')
        .select(
          'id,office_id,title,description,status_v2,priority,due_at,created_at,client_id,case_id,assigned_to_user_id,last_assigned_by_user_id,last_assigned_at, client:clients(id,name), case:cases(id,title)',
        )
        .eq('id', taskId)
        .maybeSingle();

      if (qErr) throw new Error(qErr.message);
      const t = (data as any) || null;
      setRow(t);

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

      const list = (ps || []) as any[];
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
        })) as any,
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
                {row.case?.[0] ? (
                  <Link className="link-accent" to={`/app/casos/${row.case[0].id}`}>
                    {row.case[0].title}
                  </Link>
                ) : (
                  <div className="text-sm text-white/70">—</div>
                )}
              </div>
            </div>

            <div className="text-xs text-white/40">Criada em: {fmtDT(row.created_at)}</div>

            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-ghost" onClick={() => setDelegateOpen((v) => !v)}>
                  {delegateOpen ? 'Fechar delegação' : 'Delegar'}
                </button>
              </div>
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
                    } as any);
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
