import { useEffect, useMemo, useState } from 'react';

import type { AuditLogRow } from '@/lib/audit';
import { listAuditLogs } from '@/lib/audit';
import { humanizeAudit } from '@/ui/widgets/timelineHumanize';

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function whoLabel(it: AuditLogRow) {
  const p = it.profile?.[0];
  return p?.display_name || p?.email || (it.user_id ? it.user_id.slice(0, 8) : '—');
}

const TABLE_FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'documents', label: 'Docs' },
  { id: 'finance_transactions', label: 'Financeiro' },
] as const;

type TableFilter = (typeof TABLE_FILTERS)[number]['id'];

export function TimelineSection({
  clientId,
  caseId,
  taskId,
}: {
  clientId?: string | null;
  caseId?: string | null;
  taskId?: string | null;
}) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TableFilter>('all');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const data = await listAuditLogs({
        limit: 40,
        clientId: clientId || undefined,
        caseId: caseId || undefined,
        taskId: taskId || undefined,
      });
      setRows(data);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar timeline.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, caseId, taskId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.table_name === filter);
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Timeline</div>
          <div className="text-xs text-white/60">Atividades recentes (auditoria).</div>
        </div>

        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          {TABLE_FILTERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (filter === t.id ? 'bg-white text-neutral-950' : 'text-white/70 hover:text-white')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-white/5">
        {loading ? <div className="p-4 text-sm text-white/70">Carregando…</div> : null}

        {!loading && filtered.length === 0 ? <div className="p-4 text-sm text-white/60">Sem atividades.</div> : null}

        {!loading && filtered.length ? (
          <div className="divide-y divide-white/10">
            {filtered.map((it) => {
              const h = humanizeAudit(it);
              return (
                <div key={it.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-white/50">{fmtWhen(it.created_at)}</div>
                    <div className="text-xs text-white/50">por {whoLabel(it)}</div>
                  </div>

                  <div className="mt-1 text-sm text-white/80">{h.title}</div>

                  {h.changes.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/60">
                      {h.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-2 text-xs text-white/40">
                    {it.table_name} · {it.action}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
