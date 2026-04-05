import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Lock,
  MessageSquareText,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMyOfficeId, listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

type WeeklyMetrics = {
  deadlinesMet: number;
  attendancesPerformed: number;
  piecesDrafted: number;
  diligencesMeetings: number;
  blockers: string;
};

type WeeklyReportRow = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  petitions_filed: number;
  hearings_attended: number;
  clients_served: number;
  notes: string | null;
  status: 'draft' | 'submitted' | string;
  metrics?: Record<string, unknown> | null;
};

type OfficeMemberRow = {
  user_id: string;
  role: string;
};

type TeamWeeklyStatus = {
  user_id: string;
  role: string;
  name: string;
  email: string | null;
  report: WeeklyReportRow | null;
};

type ReportDisplayStatus = 'draft' | 'submitted' | 'missing';

const REPORT_COLUMNS = '*';
const REPORTING_ROLES = new Set(['lawyer', 'member', 'staff', 'assistant']);

function createEmptyMetrics(): WeeklyMetrics {
  return {
    deadlinesMet: 0,
    attendancesPerformed: 0,
    piecesDrafted: 0,
    diligencesMeetings: 0,
    blockers: '',
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeRole(role: string | null | undefined) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'administrator') return 'admin';
  return normalized;
}

function toRoleLabel(role: string) {
  switch (normalizeRole(role)) {
    case 'admin':
      return 'Gestor';
    case 'lawyer':
      return 'Advogado(a)';
    case 'assistant':
      return 'Assistente';
    case 'staff':
      return 'Operacional';
    default:
      return 'Colaborador';
  }
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function formatWeekRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return `${startDate.toLocaleDateString('pt-BR')} ate ${endDate.toLocaleDateString('pt-BR')}`;
}

function normalizeWeekStart(value: string) {
  return toDateInput(startOfWeek(parseDateInput(value)));
}

function badgeClass(status: ReportDisplayStatus) {
  if (status === 'submitted') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (status === 'draft') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-red-400/30 bg-red-400/10 text-red-200';
}

function statusLabel(status: ReportDisplayStatus) {
  if (status === 'submitted') return 'Enviado';
  if (status === 'draft') return 'Rascunho';
  return 'Devendo';
}

function toSafeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
}

function extractMetrics(report: WeeklyReportRow | null | undefined): WeeklyMetrics {
  const raw = report?.metrics && typeof report.metrics === 'object' ? report.metrics : {};
  const metrics = raw as Record<string, unknown>;

  return {
    deadlinesMet: toSafeNumber(metrics.deadlinesMet),
    attendancesPerformed: toSafeNumber(metrics.attendancesPerformed ?? report?.clients_served),
    piecesDrafted: toSafeNumber(metrics.piecesDrafted ?? report?.petitions_filed),
    diligencesMeetings: toSafeNumber(metrics.diligencesMeetings ?? report?.hearings_attended),
    blockers: typeof metrics.blockers === 'string' ? metrics.blockers : report?.notes || '',
  };
}

function getOutputScore(metrics: WeeklyMetrics) {
  return metrics.deadlinesMet + metrics.attendancesPerformed + metrics.piecesDrafted + metrics.diligencesMeetings;
}

function isMetricsColumnMissing(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('metrics') && normalized.includes('does not exist');
}

function NumberCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: 'gold' | 'emerald' | 'sky';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'from-emerald-400/15 to-white/5 border-emerald-400/20'
      : tone === 'sky'
        ? 'from-sky-400/15 to-white/5 border-sky-400/20'
        : 'from-amber-400/15 to-white/5 border-amber-300/20';

  return (
    <Card className={cn('bg-gradient-to-br', toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/50">{label}</div>
          <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <Icon className="h-5 w-5 text-amber-300" />
        </div>
      </div>
    </Card>
  );
}

function MetricInputCard({
  icon: Icon,
  label,
  helper,
  value,
  onChange,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  helper: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{label}</div>
          <div className="mt-1 text-xs text-white/55">{helper}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <Icon className="h-4 w-4 text-amber-300" />
        </div>
      </div>

      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value || 0)))}
        className="mt-4 w-full rounded-2xl border border-white/10 bg-neutral-950/70 px-3 py-2.5 text-base text-white outline-none transition focus:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function ChecklistItem({ done, title, hint }: { done: boolean; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <div className={cn('mt-0.5 rounded-full p-1', done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/40')}>
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-white/55">{hint}</div>
      </div>
    </div>
  );
}

export function ProductivityPage() {
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [myLoading, setMyLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [managerTab, setManagerTab] = useState<'mine' | 'team'>('team');

  const [selectedWeekStart, setSelectedWeekStart] = useState(() => toDateInput(startOfWeek(new Date())));
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [form, setForm] = useState<WeeklyMetrics>(() => createEmptyMetrics());
  const [currentStatus, setCurrentStatus] = useState<'draft' | 'submitted'>('draft');
  const [history, setHistory] = useState<WeeklyReportRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamWeeklyStatus[]>([]);

  const selectedWeekEnd = useMemo(() => toDateInput(addDays(parseDateInput(selectedWeekStart), 6)), [selectedWeekStart]);
  const isManager = role === 'admin';
  const isLocked = currentStatus === 'submitted';

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setBootLoading(true);
        setError(null);

        const [user, roleNow, officeNow] = await Promise.all([
          getAuthedUser(),
          getMyOfficeRole().catch(() => ''),
          getMyOfficeId().catch(() => null),
        ]);

        if (!alive) return;
        setUserId(user.id);
        setRole(normalizeRole(roleNow));
        setOfficeId(officeNow);
        setBootLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Nao foi possivel carregar o modulo de produtividade.'));
        setBootLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isManager) {
      setManagerTab('team');
    }
  }, [isManager]);

  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadMyReports() {
      setMyLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const sb = requireSupabase();
        await getAuthedUser();

        const [currentRes, historyRes] = await Promise.all([
          sb
            .from('weekly_reports')
            .select(REPORT_COLUMNS)
            .eq('user_id', userId)
            .eq('week_start', selectedWeekStart)
            .order('week_end', { ascending: false })
            .limit(1),
          sb
            .from('weekly_reports')
            .select(REPORT_COLUMNS)
            .eq('user_id', userId)
            .order('week_start', { ascending: false })
            .limit(24),
        ]);

        if (currentRes.error) throw new Error(currentRes.error.message);
        if (historyRes.error) throw new Error(historyRes.error.message);
        if (!alive) return;

        const current = ((currentRes.data || []) as WeeklyReportRow[])[0] || null;
        const rows = (historyRes.data || []) as WeeklyReportRow[];

        setHistory(rows);
        setCurrentReportId(current?.id || null);
        setForm(extractMetrics(current));
        setCurrentStatus(current?.status === 'submitted' ? 'submitted' : 'draft');
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Nao foi possivel carregar seus relatorios semanais.'));
      } finally {
        if (alive) setMyLoading(false);
      }
    }

    void loadMyReports();
    return () => {
      alive = false;
    };
  }, [selectedWeekStart, userId]);

  useEffect(() => {
    if (!isManager || !officeId) return;

    const officeIdNow = officeId;
    let alive = true;

    async function loadTeamReports() {
      setTeamLoading(true);
      setError(null);

      try {
        const sb = requireSupabase();
        await getAuthedUser();

        const { data: membersData, error: membersError } = await sb
          .from('office_members')
          .select('user_id,role')
          .eq('office_id', officeId)
          .limit(500);

        if (membersError) throw new Error(membersError.message);

        const officeMembers = (membersData || []) as OfficeMemberRow[];
        const profiles = await listOfficeMemberProfiles(officeIdNow);
        const profilesMap = new Map<string, OfficeMemberProfile>(profiles.map((profile) => [profile.user_id, profile]));

        const reportingMembersBase = officeMembers.filter((member) => REPORTING_ROLES.has(normalizeRole(member.role)));
        const reportingMembers = reportingMembersBase.length
          ? reportingMembersBase
          : officeMembers.filter((member) => normalizeRole(member.role) !== 'admin');

        const memberIds = Array.from(new Set(reportingMembers.map((member) => member.user_id).filter(Boolean)));

        let reportRows: WeeklyReportRow[] = [];
        if (memberIds.length) {
          const { data: reportsData, error: reportsError } = await sb
            .from('weekly_reports')
            .select(REPORT_COLUMNS)
            .in('user_id', memberIds)
            .eq('week_start', selectedWeekStart);

          if (reportsError) throw new Error(reportsError.message);
          reportRows = (reportsData || []) as WeeklyReportRow[];
        }

        const reportMap = new Map<string, WeeklyReportRow>();
        for (const report of reportRows) {
          const existing = reportMap.get(report.user_id);
          if (!existing || (existing.status !== 'submitted' && report.status === 'submitted')) {
            reportMap.set(report.user_id, report);
          }
        }

        const rows = reportingMembers
          .map((member) => {
            const profile = profilesMap.get(member.user_id);
            return {
              user_id: member.user_id,
              role: normalizeRole(member.role),
              name: profile?.display_name || profile?.email?.split('@')[0] || 'Colaborador',
              email: profile?.email || null,
              report: reportMap.get(member.user_id) || null,
            } satisfies TeamWeeklyStatus;
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        if (!alive) return;
        setTeamRows(rows);
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Nao foi possivel carregar o painel gerencial da equipe.'));
      } finally {
        if (alive) setTeamLoading(false);
      }
    }

    void loadTeamReports();
    return () => {
      alive = false;
    };
  }, [isManager, officeId, selectedWeekStart]);

  async function saveReport(status: 'draft' | 'submitted') {
    if (!userId) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const basePayload = {
        user_id: userId,
        week_start: selectedWeekStart,
        week_end: selectedWeekEnd,
        petitions_filed: form.piecesDrafted,
        hearings_attended: form.diligencesMeetings,
        clients_served: form.attendancesPerformed,
        notes: form.blockers.trim() || null,
        status,
      };

      const payload: typeof basePayload & { metrics?: Record<string, unknown> } = {
        ...basePayload,
        metrics: {
          deadlinesMet: form.deadlinesMet,
          attendancesPerformed: form.attendancesPerformed,
          piecesDrafted: form.piecesDrafted,
          diligencesMeetings: form.diligencesMeetings,
          blockers: form.blockers.trim(),
        },
      };

      if (currentReportId) {
        let { error: updateError } = await sb.from('weekly_reports').update(payload).eq('id', currentReportId);

        if (updateError && isMetricsColumnMissing(updateError.message)) {
          ({ error: updateError } = await sb.from('weekly_reports').update(basePayload).eq('id', currentReportId));
        }

        if (updateError) throw new Error(updateError.message);
      } else {
        let { error: insertError } = await sb.from('weekly_reports').insert(payload);

        if (insertError && isMetricsColumnMissing(insertError.message)) {
          ({ error: insertError } = await sb.from('weekly_reports').insert(basePayload));
        }

        if (insertError) throw new Error(insertError.message);
      }

      setCurrentStatus(status);
      setSuccessMessage(status === 'submitted' ? '✅ Relatorio Enviado!' : 'Rascunho salvo com sucesso.');

      const { data: latestRows, error: latestError } = await sb
        .from('weekly_reports')
        .select(REPORT_COLUMNS)
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(24);

      if (latestError) throw new Error(latestError.message);

      const latest = (latestRows || []) as WeeklyReportRow[];
      const current = latest.find((report) => report.week_start === selectedWeekStart) || null;
      setHistory(latest);
      setCurrentReportId(current?.id || null);
      setForm(extractMetrics(current));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Nao foi possivel salvar o relatorio semanal.'));
    } finally {
      setSaving(false);
    }
  }

  function updateMetric<K extends keyof WeeklyMetrics>(key: K, value: WeeklyMetrics[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function appendNoteTemplate(template: string) {
    if (isLocked || saving) return;
    setForm((current) => ({
      ...current,
      blockers: current.blockers.trim() ? `${current.blockers.replace(/\s+$/, '')}\n${template}` : template,
    }));
  }

  const checklistProgress = useMemo(() => {
    const completedItems = [
      form.deadlinesMet > 0,
      form.attendancesPerformed > 0,
      form.piecesDrafted > 0,
      form.diligencesMeetings > 0,
      form.blockers.trim().length > 0,
    ].filter(Boolean).length;

    return {
      completedItems,
      totalItems: 5,
      percentage: Math.round((completedItems / 5) * 100),
    };
  }, [form]);

  const rankedTeamRows = useMemo(() => {
    return teamRows
      .map((row) => {
        const metrics = extractMetrics(row.report);
        const reportStatus: ReportDisplayStatus =
          row.report?.status === 'submitted' ? 'submitted' : row.report?.status === 'draft' ? 'draft' : 'missing';

        return {
          ...row,
          metrics,
          score: getOutputScore(metrics),
          reportStatus,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [teamRows]);

  const teamSummary = useMemo(() => {
    const submitted = rankedTeamRows.filter((row) => row.reportStatus === 'submitted');
    const draft = rankedTeamRows.filter((row) => row.reportStatus === 'draft');
    const missing = rankedTeamRows.filter((row) => row.reportStatus === 'missing');

    return {
      submittedCount: submitted.length,
      draftCount: draft.length,
      missingCount: missing.length,
      deadlines: submitted.reduce((sum, row) => sum + row.metrics.deadlinesMet, 0),
      attendances: submitted.reduce((sum, row) => sum + row.metrics.attendancesPerformed, 0),
      pieces: submitted.reduce((sum, row) => sum + row.metrics.piecesDrafted, 0),
      diligences: submitted.reduce((sum, row) => sum + row.metrics.diligencesMeetings, 0),
    };
  }, [rankedTeamRows]);

  const topPerformers = rankedTeamRows.filter((row) => row.score > 0).slice(0, 3);

  const myContent = (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NumberCard icon={ShieldCheck} label="Prazos cumpridos" value={form.deadlinesMet} tone="gold" />
        <NumberCard icon={Users} label="Atendimentos" value={form.attendancesPerformed} tone="emerald" />
        <NumberCard icon={FileText} label="Pecas redigidas" value={form.piecesDrafted} tone="sky" />
        <NumberCard icon={Clock3} label="Diligencias / reunioes" value={form.diligencesMeetings} tone="gold" />
      </div>

      <Card className="border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Checklist diario / semanal do colaborador</div>
            <div className="mt-1 text-xs text-white/60">
              Lance a producao da semana e registre bloqueios ou observacoes relevantes para o gestor.
            </div>
          </div>

          <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', badgeClass(currentStatus))}>
            {statusLabel(currentStatus)}
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <MetricInputCard
                icon={ShieldCheck}
                label="Prazos cumpridos"
                helper="Total de prazos entregues sem pendencia nesta semana."
                value={form.deadlinesMet}
                disabled={isLocked || saving}
                onChange={(value) => updateMetric('deadlinesMet', value)}
              />
              <MetricInputCard
                icon={Users}
                label="Atendimentos realizados"
                helper="Reunioes, retornos e atendimentos concluidos."
                value={form.attendancesPerformed}
                disabled={isLocked || saving}
                onChange={(value) => updateMetric('attendancesPerformed', value)}
              />
              <MetricInputCard
                icon={FileText}
                label="Pecas redigidas"
                helper="Minutas, manifestacoes, contratos e peticoes."
                value={form.piecesDrafted}
                disabled={isLocked || saving}
                onChange={(value) => updateMetric('piecesDrafted', value)}
              />
              <MetricInputCard
                icon={Clock3}
                label="Diligencias / reunioes"
                helper="Audiencias, diligencias externas e alinhamentos."
                value={form.diligencesMeetings}
                disabled={isLocked || saving}
                onChange={(value) => updateMetric('diligencesMeetings', value)}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Observacoes / bloqueios</div>
                  <div className="mt-1 text-xs text-white/55">Use o campo abaixo para relatar gargalos, riscos ou proximos passos.</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <MessageSquareText className="h-4 w-4 text-amber-300" />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isLocked || saving}
                  onClick={() => appendNoteTemplate('• Entregas concluidas:\n')}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Entregas
                </button>
                <button
                  type="button"
                  disabled={isLocked || saving}
                  onClick={() => appendNoteTemplate('• Bloqueios identificados:\n')}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Bloqueios
                </button>
                <button
                  type="button"
                  disabled={isLocked || saving}
                  onClick={() => appendNoteTemplate('• Proximos passos:\n')}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Proximos passos
                </button>
              </div>

              <textarea
                className="mt-3 min-h-[160px] w-full rounded-2xl border border-white/10 bg-neutral-950/70 px-3 py-3 text-sm text-white outline-none transition focus:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                value={form.blockers}
                disabled={isLocked || saving}
                onChange={(event) => updateMetric('blockers', event.target.value)}
                placeholder="Ex.: atraso de documento do cliente, dependencia do forum, demanda urgente da semana, alinhamentos necessarios."
              />
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Checklist antes do envio</div>
              <div className="mt-3 space-y-3">
                <ChecklistItem done={form.deadlinesMet > 0} title="Prazos registrados" hint="Confirme os prazos realmente cumpridos na semana." />
                <ChecklistItem done={form.attendancesPerformed > 0} title="Atendimentos contabilizados" hint="Lance os retornos e reunioes concluidos." />
                <ChecklistItem done={form.piecesDrafted > 0} title="Pecas documentadas" hint="Informe a producao juridica realizada." />
                <ChecklistItem done={form.blockers.trim().length > 0} title="Bloqueios sinalizados" hint="Avise o gestor sobre travas ou riscos relevantes." />
              </div>
            </Card>

            <Card className="border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-transparent">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Progresso do checklist</div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-3xl font-semibold text-white">{checklistProgress.percentage}%</div>
                  <div className="text-xs text-white/60">{checklistProgress.completedItems} de {checklistProgress.totalItems} itens preenchidos</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                  Score: <strong>{getOutputScore(form)}</strong>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-sky-300" style={{ width: `${checklistProgress.percentage}%` }} />
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveReport('draft')}
            disabled={saving || isLocked}
            className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && !isLocked ? 'Salvando...' : 'Salvar como Rascunho'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm('Tem certeza? Apos enviar, a edicao desta semana sera bloqueada.')) {
                void saveReport('submitted');
              }
            }}
            disabled={saving || isLocked}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
              isLocked ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-neutral-950 hover:bg-amber-300',
            )}
          >
            {isLocked ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isLocked ? '✅ Relatorio Enviado!' : saving ? 'Enviando...' : 'Enviar Relatorio Final'}
          </button>
        </div>

        {isLocked ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <Lock className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Relatorio final enviado com sucesso.</div>
              <div className="text-emerald-100/80">Os campos ficaram bloqueados para manter a integridade do fechamento semanal.</div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-300" />
          <div className="text-sm font-semibold text-white">Historico semanal</div>
        </div>
        <div className="mt-1 text-xs text-white/60">Clique em uma semana passada para revisar um rascunho ou consultar um envio final.</div>

        <div className="mt-4 grid gap-3">
          {history.length === 0 ? <div className="text-sm text-white/60">Nenhum relatorio semanal encontrado ainda.</div> : null}
          {history.map((report) => {
            const metrics = extractMetrics(report);
            const status = report.status === 'submitted' ? 'submitted' : 'draft';
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedWeekStart(report.week_start)}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition',
                  report.week_start === selectedWeekStart
                    ? 'border-amber-300/40 bg-amber-400/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{formatWeekRange(report.week_start, report.week_end)}</div>
                    <div className="mt-2 text-xs text-white/60">
                      Prazos: {metrics.deadlinesMet} · Atendimentos: {metrics.attendancesPerformed} · Pecas: {metrics.piecesDrafted} · Diligencias: {metrics.diligencesMeetings}
                    </div>
                  </div>
                  <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', badgeClass(status))}>
                    {statusLabel(status)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );

  const teamContent = (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <NumberCard icon={Send} label="Enviados" value={teamSummary.submittedCount} tone="emerald" />
        <NumberCard icon={Clock3} label="Rascunhos" value={teamSummary.draftCount} tone="gold" />
        <NumberCard icon={ClipboardList} label="Devendo" value={teamSummary.missingCount} tone="sky" />
        <NumberCard icon={ShieldCheck} label="Prazos" value={teamSummary.deadlines} tone="gold" />
        <NumberCard icon={Users} label="Atendimentos" value={teamSummary.attendances} tone="emerald" />
        <NumberCard icon={BarChart3} label="Pecas / diligencias" value={teamSummary.pieces + teamSummary.diligences} tone="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {topPerformers.length === 0 ? (
          <Card className="lg:col-span-3 border-white/10 bg-white/5">
            <div className="text-sm text-white/70">Ainda nao ha entregas registradas nesta semana para destacar no ranking.</div>
          </Card>
        ) : (
          topPerformers.map((row, index) => (
            <Card key={row.user_id} className="border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-white/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-white/55">Top {index + 1}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{row.name}</div>
                  <div className="text-xs text-white/60">{toRoleLabel(row.role)}</div>
                </div>
                <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', badgeClass(row.reportStatus))}>
                  {statusLabel(row.reportStatus)}
                </span>
              </div>
              <div className="mt-4 text-3xl font-semibold text-white">{row.score}</div>
              <div className="mt-1 text-xs text-white/60">entregas somadas na semana</div>
              <div className="mt-3 text-xs text-white/70">
                Prazos {row.metrics.deadlinesMet} · Atendimentos {row.metrics.attendancesPerformed} · Pecas {row.metrics.piecesDrafted}
              </div>
            </Card>
          ))
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Painel gerencial da produtividade semanal</div>
            <div className="mt-1 text-xs text-white/60">
              Ordenado por volume de producao para facilitar a leitura e o acompanhamento do time.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
            Equipe acompanhada: <strong>{rankedTeamRows.length}</strong>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="px-3 py-3 font-medium">Colaborador</th>
                <th className="px-3 py-3 font-medium">Cargo</th>
                <th className="px-3 py-3 font-medium">Score</th>
                <th className="px-3 py-3 font-medium">Prazos</th>
                <th className="px-3 py-3 font-medium">Atendimentos</th>
                <th className="px-3 py-3 font-medium">Pecas</th>
                <th className="px-3 py-3 font-medium">Diligencias</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Observacoes / bloqueios</th>
              </tr>
            </thead>
            <tbody>
              {rankedTeamRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-sm text-white/60">
                    Nenhum colaborador elegivel para relatorio semanal foi encontrado neste escritorio.
                  </td>
                </tr>
              ) : null}

              {rankedTeamRows.map((row) => (
                <tr key={row.user_id} className="border-b border-white/5 align-top text-white/80">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{row.name}</div>
                    <div className="mt-1 text-xs text-white/50">{row.email || 'Sem e-mail'}</div>
                  </td>
                  <td className="px-3 py-3 text-white/60">{toRoleLabel(row.role)}</td>
                  <td className="px-3 py-3 font-semibold text-white">{row.score || '-'}</td>
                  <td className="px-3 py-3">{row.metrics.deadlinesMet || '-'}</td>
                  <td className="px-3 py-3">{row.metrics.attendancesPerformed || '-'}</td>
                  <td className="px-3 py-3">{row.metrics.piecesDrafted || '-'}</td>
                  <td className="px-3 py-3">{row.metrics.diligencesMeetings || '-'}</td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', badgeClass(row.reportStatus))}>
                      {statusLabel(row.reportStatus)}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-3 py-3 whitespace-pre-line text-xs text-white/65">
                    {row.metrics.blockers.trim() || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(560px_220px_at_0%_0%,rgba(251,191,36,0.18),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Produtividade semanal</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Checklist do time juridico</h1>
            <p className="mt-1 text-sm text-white/60">
              {isManager
                ? 'Acompanhe a semana em um painel mais visual e mantenha sua propria entrega registrada em uma aba dedicada.'
                : 'Preencha sua rotina da semana em um formato mais simples, visual e rapido de revisar.'}
            </p>
          </div>

          <Card className="min-w-[240px] border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-white/5">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <CalendarDays className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/50">Semana selecionada</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatWeekRange(selectedWeekStart, selectedWeekEnd)}</div>
                <div className="mt-3 text-xs text-white/60">Selecione sempre a data inicial da semana.</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{successMessage}</div> : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Filtro semanal</div>
            <div className="text-xs text-white/60">
              {isManager ? 'Troque a semana para revisar a equipe ou preencher o seu proprio checklist.' : 'Escolha a semana para preencher ou revisar seu relatorio.'}
            </div>
          </div>

          <label className="text-sm text-white/80">
            Inicio da semana
            <input
              type="date"
              className="input mt-1 min-w-[210px]"
              value={selectedWeekStart}
              onChange={(event) => {
                if (!event.target.value) return;
                setSelectedWeekStart(normalizeWeekStart(event.target.value));
              }}
            />
          </label>
        </div>
      </Card>

      {bootLoading ? (
        <Card>
          <div className="text-sm text-white/70">Carregando produtividade semanal...</div>
        </Card>
      ) : null}

      {!bootLoading && !isManager ? (
        myLoading ? (
          <Card>
            <div className="text-sm text-white/70">Carregando seu checklist semanal...</div>
          </Card>
        ) : (
          myContent
        )
      ) : null}

      {!bootLoading && isManager ? (
        <Tabs value={managerTab} onValueChange={(value) => setManagerTab(value as 'mine' | 'team')} className="w-full">
          <TabsList className="grid w-full max-w-[420px] grid-cols-2 rounded-2xl border border-white/15 bg-gradient-to-r from-white/10 to-white/5 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <TabsTrigger value="team" className="rounded-xl text-white/75 data-[state=active]:bg-white data-[state=active]:text-neutral-950">
              Painel da equipe
            </TabsTrigger>
            <TabsTrigger value="mine" className="rounded-xl text-white/75 data-[state=active]:bg-white data-[state=active]:text-neutral-950">
              Meu checklist
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-4 space-y-6">
            {teamLoading ? (
              <Card>
                <div className="text-sm text-white/70">Carregando visao gerencial da equipe...</div>
              </Card>
            ) : (
              teamContent
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-4 space-y-6">
            {myLoading ? (
              <Card>
                <div className="text-sm text-white/70">Carregando seu checklist semanal...</div>
              </Card>
            ) : (
              myContent
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
