import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type TaskStatus = 'open' | 'in_progress' | 'paused' | 'done' | 'cancelled' | string;

type Profile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status_v2: TaskStatus;
  priority: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
};

function fmtDT(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function profileLabel(p: Profile) {
  return p.display_name || p.email || p.user_id;
}

export function TaskGroupPage() {
  const { groupId } = useParams();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p] as const)), [profiles]);

  useEffect(() => {
    (async () => {
      if (!groupId) return;
      setLoading(true);
      setError(null);

      try {
        const sb = requireSupabase();
        await getAuthedUser();

        const [{ data: tasks, error: tErr }, { data: ps }] = await Promise.all([
          sb
            .from('tasks')
            .select('id,title,status_v2,priority,due_at,assigned_to_user_id,created_at')
            .eq('task_group_id', groupId)
            .order('created_at', { ascending: true }),
          sb.from('user_profiles').select('user_id,display_name,email').limit(500),
        ]);

        if (tErr) throw new Error(tErr.message);
        setRows((tasks || []) as TaskRow[]);
        setProfiles((ps || []) as Profile[]);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || 'Falha ao carregar lote.');
        setLoading(false);
      }
    })();
  }, [groupId]);

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.status_v2 === 'done').length;
    const cancelled = rows.filter((r) => r.status_v2 === 'cancelled').length;
    const openish = rows.filter((r) => r.status_v2 !== 'done' && r.status_v2 !== 'cancelled');
    return { total, done, cancelled, openish: openish.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tarefas (lote)</h1>
          <p className="text-sm text-white/60">Grupo: {groupId ? String(groupId).slice(0, 8) : '—'}</p>
        </div>
        <Link to="/app/tarefas" className="btn-ghost">
          Voltar
        </Link>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}

        {!loading ? (
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Total: <span className="text-white">{stats.total}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Em aberto: <span className="text-amber-200">{stats.openish}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Concluídas: <span className="text-green-200">{stats.done}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
              Canceladas: <span className="text-red-200">{stats.cancelled}</span>
            </div>
          </div>
        ) : null}

        {!loading && rows.length ? (
          <div className="mt-4 grid gap-2">
            {rows.map((t) => {
              const assigned = t.assigned_to_user_id ? profileMap.get(t.assigned_to_user_id) : null;
              return (
                <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link to={`/app/tarefas/${t.id}`} className="text-sm font-semibold text-white hover:underline">
                        {t.title}
                      </Link>
                      <div className="mt-2 text-xs text-white/50">
                        Responsável: {assigned ? profileLabel(assigned) : t.assigned_to_user_id || '—'} · Status:{' '}
                        <span className="badge">{t.status_v2}</span> · Prioridade: {t.priority}
                      </div>
                      <div className="mt-1 text-xs text-white/50">Prazo: {fmtDT(t.due_at)}</div>
                    </div>
                    <Link to={`/app/tarefas/${t.id}`} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                      Abrir
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!loading && !rows.length ? <div className="mt-4 text-sm text-white/60">Nenhuma tarefa neste lote.</div> : null}
      </Card>
    </div>
  );
}
