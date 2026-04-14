import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  ClipboardCopy,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  Search,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  XCircle,
} from 'lucide-react';

import { listOfficeMemberProfiles, getMyOfficeId, type OfficeMemberProfile } from '@/lib/officeContext';
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

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const [y, m, d] = value.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtDatetime(value: string | null | undefined): string | null {
  if (!value) return null;
  const dt = new Date(value);
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBadge(status: string) {
  if (status === 'aprovado') return 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300';
  if (status === 'reprovado') return 'border-red-400/40 bg-red-400/15 text-red-300';
  return 'border-amber-400/40 bg-amber-400/15 text-amber-200';
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

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    atendimento: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
    'peti\u00e7\u00e3o': 'bg-violet-400/15 text-violet-300 border-violet-400/30',
    peticao: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
    'audi\u00eancia': 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    audiencia: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    financeiro: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    administrativo: 'bg-white/10 text-white/60 border-white/20',
    'dilig\u00eancia': 'bg-orange-400/15 text-orange-300 border-orange-400/30',
    diligencia: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  };
  return map[cat.toLowerCase()] ?? 'bg-white/10 text-white/60 border-white/20';
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
  reviewerName,
  onClose,
  onUpdateStatus,
}: {
  report: TeamReportRow | null;
  reviewerName: string;
  onClose: () => void;
  onUpdateStatus: (id: string, status: 'aprovado' | 'reprovado', comment: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>(report?.status || 'enviado');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<'aprovado' | 'reprovado' | null>(null);

  useEffect(() => {
    setLocalStatus(report?.status || 'enviado');
    setComment(report?.manager_comment || '');
    setCommentError('');
    setPendingAction(null);
  }, [report]);

  async function handleStatus(newStatus: 'aprovado' | 'reprovado') {
    if (!report) return;
    if (newStatus === 'reprovado' && !comment.trim()) {
      setCommentError('O comentário é obrigatório ao reprovar.');
      return;
    }
    setCommentError('');
    setSaving(true);
    try {
      await onUpdateStatus(report.id, newStatus, comment.trim());
      setLocalStatus(newStatus);
      setPendingAction(null);
    } finally {
      setSaving(false);
    }
  }

  function buildCopyText() {
    if (!report) return '';
    const lines: string[] = [
      `Relatório de Produtividade — ${report.collaborator_name}`,
      `Data: ${fmtDate(report.report_date)}`,
      `Status: ${statusLabel(localStatus)}`,
      '',
      `Tarefas: ${report.completed_tasks} concluídas / ${report.total_tasks} total (${pct(report.completed_tasks, report.total_tasks)})`,
    ];
    if (report.notes) lines.push('', `Observações: ${report.notes}`);
    const finalComment = comment || report.manager_comment;
    if (finalComment) lines.push('', `Comentário da gestão: ${finalComment}`);
    if (report.activities.length) {
      lines.push('', 'Atividades:');
      report.activities.forEach((a, i) => {
        lines.push(`  ${i + 1}. ${a.title || 'Atividade'} [${a.done ? 'concluída' : 'pendente'}]`);
      });
    }
    return lines.join('\n');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors silently
    }
  }

  if (!report) return null;

  const completion = report.total_tasks
    ? Math.round((report.completed_tasks / report.total_tasks) * 100)
    : null;

  // Agrupamento por categoria/tipo
  const grouped = report.activities.reduce<Record<string, typeof report.activities>>((acc, act) => {
    const cat = String(act.category || act.type || 'Geral');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(act);
    return acc;
  }, {});
  const hasGrouped = Object.keys(grouped).length > 1 || (Object.keys(grouped).length === 1 && !('Geral' in grouped));

  const timelineEvents = [
    { label: 'Criado em', value: fmtDatetime(report.created_at) },
    report.updated_at && report.updated_at !== report.created_at
      ? { label: 'Atualizado em', value: fmtDatetime(report.updated_at) }
      : null,
    report.reviewed_at ? { label: 'Revisado em', value: fmtDatetime(report.reviewed_at) } : null,
  ].filter(Boolean) as { label: string; value: string | null }[];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-neutral-950 shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Detalhes do Relatório</h2>
            <p className="truncate text-xs text-white/55">
              {report.collaborator_name} · {fmtDate(report.report_date)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleCopy}
              title="Copiar resumo para área de transferência"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? 'Copiado!' : 'Copiar resumo'}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Status banner proeminente */}
          <div className={cn('flex items-center gap-3 rounded-2xl border px-5 py-3.5', statusBadge(localStatus))}>
            <span className="text-sm font-bold">{statusLabel(localStatus)}</span>
            {completion !== null && (
              <span className="ml-auto text-xs opacity-80">Conclusão: {completion}%</span>
            )}
          </div>

          {/* Métricas numéricas */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total', value: report.total_tasks },
              { label: 'Concluídas', value: report.completed_tasks },
              { label: 'Pendentes', value: report.pending_tasks },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center">
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="mt-0.5 text-xs text-white/50">{label}</div>
              </div>
            ))}
          </div>

          {/* Atividades executadas */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Atividades Executadas ({report.activities.length})
            </h3>
            {report.activities.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/40">
                Nenhuma atividade detalhada enviada.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.activities.map((act, idx) => (
                  <li key={idx} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {act.done
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          : <Circle className="h-4 w-4 text-white/25" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">
                          {act.title || `Atividade ${idx + 1}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/50">
                          {act.client && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />{String(act.client)}
                            </span>
                          )}
                          {(act.process || act.processo) && (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />{String(act.process || act.processo)}
                            </span>
                          )}
                          {(act.category || act.type) && (
                            <span className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                              categoryColor(String(act.category || act.type))
                            )}>
                              {String(act.category || act.type)}
                            </span>
                          )}
                          {act.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{String(act.time)}
                            </span>
                          )}
                        </div>
                        {(act.description || act.observation || act.observacao) && (
                          <p className="mt-1.5 text-xs leading-relaxed text-white/55">
                            {String(act.description || act.observation || act.observacao)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Produtividade por tipo */}
          {hasGrouped && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <Tag className="h-3.5 w-3.5" />
                Produtividade por Tipo
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(grouped).map(([cat, acts]) => (
                  <div
                    key={cat}
                    className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold', categoryColor(cat))}
                  >
                    <span>{cat}</span>
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{acts.length}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Observações do colaborador */}
          {report.notes && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <MessageSquare className="h-3.5 w-3.5" />
                Observações do Colaborador
              </h3>
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/80">
                {report.notes}
              </p>
            </section>
          )}

          {/* Comentário da gestão já salvo */}
          {report.manager_comment && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                Comentário da Gestão
              </h3>
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-relaxed text-white/80">
                {report.manager_comment}
              </p>
              {reviewerName && (
                <p className="mt-1.5 text-xs text-white/35">por {reviewerName}</p>
              )}
            </section>
          )}

          {/* Linha do tempo */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              <Clock className="h-3.5 w-3.5" />
              Linha do Tempo
            </h3>
            <ol className="relative ml-2 space-y-4 border-l border-white/10 pb-1">
              {timelineEvents.map((e) => (
                <li key={e.label} className="ml-4">
                  <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-white/20 bg-neutral-900" />
                  <p className="text-xs font-medium text-white/70">{e.label}</p>
                  <p className="text-xs text-white/40">{e.value ?? '—'}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* footer — ações */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4 space-y-3">
          {pendingAction === null ? (
            <div className="flex gap-3">
              <button
                disabled={saving || localStatus === 'aprovado'}
                onClick={() => setPendingAction('aprovado')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4" />
                Aprovar
              </button>
              <button
                disabled={saving || localStatus === 'reprovado'}
                onClick={() => setPendingAction('reprovado')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ThumbsDown className="h-4 w-4" />
                Reprovar
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold text-white">
                {pendingAction === 'reprovado'
                  ? 'Comentário (obrigatório para reprovar)'
                  : 'Comentário da gestão (opcional)'}
              </p>
              <textarea
                rows={3}
                placeholder={pendingAction === 'reprovado' ? 'Explique o motivo da reprovação…' : 'Adicionar observação…'}
                value={comment}
                onChange={(e) => { setComment(e.target.value); setCommentError(''); }}
                className="w-full resize-none rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40"
              />
              {commentError && <p className="text-xs text-red-400">{commentError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setPendingAction(null); setCommentError(''); }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  onClick={() => handleStatus(pendingAction)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50',
                    pendingAction === 'aprovado'
                      ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                      : 'border-red-400/30 bg-red-400/15 text-red-300 hover:bg-red-400/25'
                  )}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pendingAction === 'aprovado' ? 'Confirmar aprovação' : 'Confirmar reprovação'}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Page principal ─── */

export function TeamReportsPage() {
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
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
        const user = await getAuthedUser();
        const officeId = await getMyOfficeId().catch(() => null);
        const [roleNow, membersNow] = await Promise.all([
          getMyOfficeRole().catch(() => ''),
          officeId ? listOfficeMemberProfiles(officeId).catch(() => []) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setUserId(user.id);
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

  const memberNameMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.display_name || m.email || ''])),
    [members]
  );

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

  async function handleUpdateStatus(id: string, status: 'aprovado' | 'reprovado', comment: string) {
    await updateReportStatus(id, status, comment, userId);
    const now = new Date().toISOString();
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, manager_comment: comment || r.manager_comment, reviewed_by: userId, reviewed_at: now, updated_at: now }
          : r
      )
    );
    setSelected((prev) =>
      prev?.id === id
        ? { ...prev, status, manager_comment: comment || prev.manager_comment, reviewed_by: userId, reviewed_at: now, updated_at: now }
        : prev
    );
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
          reviewerName={memberNameMap.get(selected.reviewed_by || '') || ''}
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
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Conclusão %</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">Últ. atualização</th>
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
                          ({r.pending_tasks} pend.)
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
                    <td className="px-4 py-3 text-xs text-white/40">
                      {fmtDatetime(r.updated_at || r.created_at) ?? '—'}
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
