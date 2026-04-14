import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  Filter,
  Loader2,
  Search,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  XCircle,
} from 'lucide-react';

import { listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getMyOfficeId } from '@/lib/officeContext';
import { getMyOfficeRole } from '@/lib/roles';
import {
  computeSummary,
  fetchTeamReports,
  updateReportStatus,
  type TeamReportFilters,
  type TeamReportRow,
  type TeamReportSummary,
} from '@/lib/teamReports';
import { getAuthedUser } from '@/lib/supabaseDb';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

/* ─── helpers ─── */

function fmtDate(value: string) {
  if (!value) return '—';
  const [y, m, d] = value.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtDatetime(value: string) {
  if (!value) return '—';
  const dt = new Date(value);
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBadge(status: string) {
  if (status === 'aprovado') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  if (status === 'reprovado') return 'border-red-400/30 bg-red-400/10 text-red-300';
  return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
}

function statusLabel(status: string) {
  if (status === 'aprovado') return 'Aprovado';
  if (status === 'reprovado') return 'Reprovado';
  return 'Enviado';
}

function pct(completed: number, total: number) {
  if (!total) return '—';
  return `${Math.round((completed / total) * 100)}%`;
}

/* ─── sub-components ─── */

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">{label}</span>
        <div className={cn('rounded-xl border border-white/10 bg-white/5 p-2', accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </Card>
  );
}

/* ─── Drawer de detalhes ─── */

function DetailsDrawer({
  report,
  onClose,
  onUpdateStatus,
}: {
  report: TeamReportRow | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: 'aprovado' | 'reprovado' | 'enviado') => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>(report?.status || 'enviado');

  useEffect(() => {
    setLocalStatus(report?.status || 'enviado');
  }, [report]);

  async function handleStatus(newStatus: 'aprovado' | 'reprovado') {
    if (!report) return;
    setSaving(true);
    try {
      await onUpdateStatus(report.id, newStatus);
      setLocalStatus(newStatus);
    } finally {
      setSaving(false);
    }
  }

  if (!report) return null;

  const completion = report.total_tasks
    ? Math.round((report.completed_tasks / report.total_tasks) * 100)
    : null;

  return (
    <>
      {/* overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* panel */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-neutral-950/95 shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-white">Detalhes do Relatório</h2>
            <p className="text-xs text-white/55">
              {report.collaborator_name} · {fmtDate(report.report_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* status badge */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                statusBadge(localStatus)
              )}
            >
              {statusLabel(localStatus)}
            </span>
            {completion !== null && (
              <span className="text-xs text-white/50">Conclusão: {completion}%</span>
            )}
          </div>

          {/* resumo numérico */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total', value: report.total_tasks },
              { label: 'Concluídas', value: report.completed_tasks },
              { label: 'Pendentes', value: report.pending_tasks },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center"
              >
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="mt-1 text-xs text-white/50">{label}</div>
              </div>
            ))}
          </div>

          {/* atividades */}
          {report.activities.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                Atividades ({report.activities.length})
              </h3>
              <ul className="space-y-2">
                {report.activities.map((act, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <CheckCircle2
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        act.done ? 'text-emerald-400' : 'text-white/30'
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {act.title || `Atividade ${idx + 1}`}
                      </p>
                      {act.description && (
                        <p className="mt-0.5 text-xs text-white/55">{act.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* observações */}
          {report.notes && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                Observações
              </h3>
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/80">
                {report.notes}
              </p>
            </section>
          )}

          {/* timestamp */}
          <p className="text-xs text-white/35">
            Enviado em: {fmtDatetime(report.created_at)}
          </p>
        </div>

        {/* footer ações */}
        <div className="border-t border-white/10 px-6 py-4">
          <p className="mb-3 text-xs text-white/45">Alterar status do relatório:</p>
          <div className="flex gap-3">
            <button
              disabled={saving || localStatus === 'aprovado'}
              onClick={() => handleStatus('aprovado')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
              Aprovar
            </button>
            <button
              disabled={saving || localStatus === 'reprovado'}
              onClick={() => handleStatus('reprovado')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
              Reprovar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ─── Page principal ─── */

export function TeamReportsPage() {
  const [role, setRole] = useState('');
  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<TeamReportRow[]>([]);
  const [members, setMembers] = useState<OfficeMemberProfile[]>([]);
  const [selected, setSelected] = useState<TeamReportRow | null>(null);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Boot: auth + role + members
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBootLoading(true);
        const officeId = await getMyOfficeId().catch(() => null);
        const [roleNow, membersNow] = await Promise.all([
          getMyOfficeRole().catch(() => ''),
          officeId ? listOfficeMemberProfiles(officeId).catch(() => []) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setRole(String(roleNow || '').toLowerCase());
        setMembers(membersNow);
      } catch {
        if (alive) setError('Não foi possível inicializar a página.');
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isAdmin = role === 'admin' || role === 'owner' || role === 'administrator';

  // Fetch reports
  const loadReports = useCallback(async (filters: TeamReportFilters) => {
    setLoading(true);
    setError(null);
    try {
      await getAuthedUser();
      const rows = await fetchTeamReports(filters);
      setReports(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bootLoading) {
      void loadReports({
        userId: filterUser || undefined,
        dateFrom: filterFrom || undefined,
        dateTo: filterTo || undefined,
        status: filterStatus || undefined,
        search: filterSearch || undefined,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootLoading, filterUser, filterFrom, filterTo, filterStatus, filterSearch]);

  const summary: TeamReportSummary = useMemo(() => computeSummary(reports), [reports]);

  async function handleUpdateStatus(id: string, status: 'aprovado' | 'reprovado' | 'enviado') {
    await updateReportStatus(id, status);
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
    if (selected?.id === id) {
      setSelected((prev) => (prev ? { ...prev, status } : prev));
    }
  }

  function clearFilters() {
    setFilterUser('');
    setFilterFrom('');
    setFilterTo('');
    setFilterStatus('');
    setFilterSearch('');
  }

  const hasFilters = filterUser || filterFrom || filterTo || filterStatus || filterSearch;

  if (bootLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-white/60">
          Acesso restrito a administradores e gestores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-4 py-8 md:px-8">
      {/* Drawer */}
      {selected && (
        <DetailsDrawer
          report={selected}
          onClose={() => setSelected(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios da Equipe</h1>
          <p className="mt-1 text-sm text-white/55">
            Acompanhe os relatórios de produtividade enviados pelos colaboradores.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <FileText className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-white/80">{reports.length} relatórios</span>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={FileText}
          label="Total no período"
          value={summary.total}
          accent="text-amber-400"
        />
        <SummaryCard
          icon={Users}
          label="Colaboradores"
          value={summary.usersCount}
          accent="text-sky-400"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Tarefas concluídas"
          value={summary.totalCompleted}
          accent="text-emerald-400"
        />
        <SummaryCard
          icon={BarChart3}
          label="% média de conclusão"
          value={summary.avgCompletion > 0 ? `${summary.avgCompletion}%` : '—'}
          accent="text-violet-400"
        />
      </div>

      {/* Filtros */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Filtros</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Colaborador */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">Colaborador</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/40"
            >
              <option value="">Todos</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.email || m.user_id}
                </option>
              ))}
            </select>
          </div>

          {/* De */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">De</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/40"
            />
          </div>

          {/* Até */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">Até</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/40"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/40"
            >
              <option value="">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </div>
        </div>

        {/* Busca textual */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            placeholder="Buscar por colaborador ou observação..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-neutral-950/70 py-2 pl-10 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40"
          />
        </div>
      </Card>

      {/* Erro */}
      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Tabela / lista */}
      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileText className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/40">Nenhum relatório encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Colaborador</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Resumo</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Conclusão</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    className="group transition hover:bg-white/5"
                  >
                    <td className="px-4 py-3 font-medium text-white/80">{fmtDate(r.report_date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.collaborator_name}</div>
                      {r.collaborator_email && (
                        <div className="text-xs text-white/40">{r.collaborator_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      <span className="text-emerald-400">{r.completed_tasks}</span>
                      <span className="text-white/30"> / </span>
                      <span>{r.total_tasks} tarefas</span>
                      {r.pending_tasks > 0 && (
                        <span className="ml-2 text-xs text-amber-300/70">
                          ({r.pending_tasks} pendente{r.pending_tasks !== 1 ? 's' : ''})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{
                              width: `${r.total_tasks ? Math.min(100, Math.round((r.completed_tasks / r.total_tasks) * 100)) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-white/50">
                          {pct(r.completed_tasks, r.total_tasks)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          statusBadge(r.status)
                        )}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(r)}
                        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Ver detalhes
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
