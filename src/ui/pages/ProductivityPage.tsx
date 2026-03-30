import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react';

import { getMyOfficeId, listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

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

const REPORT_COLUMNS =
  'id,user_id,week_start,week_end,petitions_filed,hearings_attended,clients_served,notes,status';

const REPORTING_ROLES = new Set(['lawyer', 'member', 'staff', 'assistant']);

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeRole(role: string | null | undefined) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'administrator') return 'admin';
  return normalized;
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

function badgeClass(status: 'draft' | 'submitted' | 'missing') {
  if (status === 'submitted') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (status === 'draft') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-red-400/30 bg-red-400/10 text-red-200';
}

function NumberCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
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

export function ProductivityPage() {
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedWeekStart, setSelectedWeekStart] = useState(() => toDateInput(startOfWeek(new Date())));

  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [petitionsFiled, setPetitionsFiled] = useState(0);
  const [hearingsAttended, setHearingsAttended] = useState(0);
  const [clientsServed, setClientsServed] = useState(0);
  const [notes, setNotes] = useState('');
  const [currentStatus, setCurrentStatus] = useState<'draft' | 'submitted'>('draft');
  const [history, setHistory] = useState<WeeklyReportRow[]>([]);

  const [teamRows, setTeamRows] = useState<TeamWeeklyStatus[]>([]);

  const selectedWeekEnd = useMemo(() => toDateInput(addDays(parseDateInput(selectedWeekStart), 6)), [selectedWeekStart]);
  const isManager = role === 'admin';

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
    if (!userId) return;

    let alive = true;

    async function loadMyReports() {
      setPageLoading(true);
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
        setPetitionsFiled(Number(current?.petitions_filed || 0));
        setHearingsAttended(Number(current?.hearings_attended || 0));
        setClientsServed(Number(current?.clients_served || 0));
        setNotes(current?.notes || '');
        setCurrentStatus(current?.status === 'submitted' ? 'submitted' : 'draft');
        setPageLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Nao foi possivel carregar seus relatarios semanais.'));
        setPageLoading(false);
      }
    }

    async function loadTeamReports() {
      setPageLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        if (!officeId) throw new Error('Escritorio nao encontrado para montar o painel gerencial.');

        const sb = requireSupabase();
        await getAuthedUser();

        const { data: membersData, error: membersError } = await sb
          .from('office_members')
          .select('user_id,role')
          .eq('office_id', officeId)
          .limit(500);

        if (membersError) throw new Error(membersError.message);

        const officeMembers = (membersData || []) as OfficeMemberRow[];
        const profiles = await listOfficeMemberProfiles(officeId);
        const profilesMap = new Map<string, OfficeMemberProfile>(
          profiles.map((profile) => [profile.user_id, profile]),
        );

        const reportingMembersBase = officeMembers.filter((member) =>
          REPORTING_ROLES.has(normalizeRole(member.role)),
        );
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
        setPageLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(getErrorMessage(err, 'Nao foi possivel carregar o painel gerencial da equipe.'));
        setPageLoading(false);
      }
    }

    if (isManager) {
      void loadTeamReports();
      return () => {
        alive = false;
      };
    }

    void loadMyReports();
    return () => {
      alive = false;
    };
  }, [isManager, officeId, selectedWeekStart, userId]);

  async function saveReport(status: 'draft' | 'submitted') {
    if (!userId) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const payload = {
        user_id: userId,
        week_start: selectedWeekStart,
        week_end: selectedWeekEnd,
        petitions_filed: petitionsFiled,
        hearings_attended: hearingsAttended,
        clients_served: clientsServed,
        notes: notes.trim() || null,
        status,
      };

      if (currentReportId) {
        const { error: updateError } = await sb.from('weekly_reports').update(payload).eq('id', currentReportId);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await sb.from('weekly_reports').insert(payload);
        if (insertError) throw new Error(insertError.message);
      }

      setCurrentStatus(status);
      setSuccessMessage(status === 'submitted' ? 'Relatorio semanal enviado com sucesso.' : 'Rascunho salvo com sucesso.');

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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Nao foi possivel salvar o relatorio semanal.'));
    } finally {
      setSaving(false);
    }
  }

  const teamSummary = useMemo(() => {
    const submitted = teamRows.filter((row) => row.report?.status === 'submitted');
    const draft = teamRows.filter((row) => row.report?.status === 'draft');
    const missing = teamRows.filter((row) => !row.report);

    return {
      submittedCount: submitted.length,
      draftCount: draft.length,
      missingCount: missing.length,
      petitions: submitted.reduce((sum, row) => sum + Number(row.report?.petitions_filed || 0), 0),
      hearings: submitted.reduce((sum, row) => sum + Number(row.report?.hearings_attended || 0), 0),
      clients: submitted.reduce((sum, row) => sum + Number(row.report?.clients_served || 0), 0),
    };
  }, [teamRows]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(560px_220px_at_0%_0%,rgba(251,191,36,0.18),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Modulo Semanal</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Produtividade da equipe</h1>
            <p className="mt-1 text-sm text-white/60">
              {isManager
                ? 'Dashboard gerencial para acompanhar envios e consolidado semanal do escritorio.'
                : 'Registre sua producao da semana, salve rascunhos e envie seu relatorio final.'}
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
              {isManager ? 'Troque a semana para revisar toda a equipe.' : 'Escolha a semana para preencher ou revisar seu relatorio.'}
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

      {bootLoading || pageLoading ? (
        <Card>
          <div className="text-sm text-white/70">Carregando produtividade semanal...</div>
        </Card>
      ) : null}

      {!bootLoading && !pageLoading && !isManager ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberCard icon={FileText} label="Peticoes" value={petitionsFiled} tone="gold" />
            <NumberCard icon={Clock3} label="Audiencias" value={hearingsAttended} tone="sky" />
            <NumberCard icon={Users} label="Clientes" value={clientsServed} tone="emerald" />
          </div>

          <Card className="border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-white/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">Formulario semanal</div>
                <div className="mt-1 text-xs text-white/60">
                  Preencha sua entrega da semana e decida se deseja manter em rascunho ou enviar o relatorio final.
                </div>
              </div>

              <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', badgeClass(currentStatus))}>
                {currentStatus === 'submitted' ? 'Enviado' : 'Rascunho'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-white/80">
                Peticoes protocoladas
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={petitionsFiled}
                  disabled={currentStatus === 'submitted' || saving}
                  onChange={(event) => setPetitionsFiled(Math.max(0, Number(event.target.value || 0)))}
                />
              </label>

              <label className="text-sm text-white/80">
                Audiencias realizadas
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={hearingsAttended}
                  disabled={currentStatus === 'submitted' || saving}
                  onChange={(event) => setHearingsAttended(Math.max(0, Number(event.target.value || 0)))}
                />
              </label>

              <label className="text-sm text-white/80">
                Clientes atendidos
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={clientsServed}
                  disabled={currentStatus === 'submitted' || saving}
                  onChange={(event) => setClientsServed(Math.max(0, Number(event.target.value || 0)))}
                />
              </label>

              <label className="text-sm text-white/80 md:col-span-3">
                Observacoes da semana
                <textarea
                  className="input mt-1 min-h-[140px]"
                  value={notes}
                  disabled={currentStatus === 'submitted' || saving}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Descreva entregas, gargalos, avancos importantes ou pendencias da semana."
                />
              </label>
            </div>

            {currentStatus !== 'submitted' ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveReport('draft')}
                  disabled={saving}
                  className="btn-ghost"
                >
                  {saving ? 'Salvando...' : 'Salvar como Rascunho'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Tem certeza? Apos enviar, voce nao podera alterar os dados desta semana.')) {
                      void saveReport('submitted');
                    }
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {saving ? 'Enviando...' : 'Enviar Relatorio Final'}
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Relatorio final enviado e bloqueado para edicao.
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-300" />
              <div className="text-sm font-semibold text-white">Historico semanal</div>
            </div>
            <div className="mt-1 text-xs text-white/60">Clique em uma semana passada para revisar ou continuar um rascunho.</div>

            <div className="mt-4 grid gap-3">
              {history.length === 0 ? <div className="text-sm text-white/60">Nenhum relatorio semanal encontrado ainda.</div> : null}
              {history.map((report) => (
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
                        Peticoes: {report.petitions_filed} · Audiencias: {report.hearings_attended} · Clientes: {report.clients_served}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide',
                        badgeClass(report.status === 'submitted' ? 'submitted' : 'draft'),
                      )}
                    >
                      {report.status === 'submitted' ? 'Enviado' : 'Rascunho'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {!bootLoading && !pageLoading && isManager ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <NumberCard icon={Send} label="Enviados" value={teamSummary.submittedCount} tone="emerald" />
            <NumberCard icon={Clock3} label="Rascunhos" value={teamSummary.draftCount} tone="gold" />
            <NumberCard icon={ClipboardList} label="Devendo" value={teamSummary.missingCount} tone="sky" />
            <NumberCard icon={FileText} label="Peticoes" value={teamSummary.petitions} tone="gold" />
            <NumberCard icon={TrendingUp} label="Audiencias" value={teamSummary.hearings} tone="sky" />
            <NumberCard icon={Users} label="Clientes" value={teamSummary.clients} tone="emerald" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Dashboard gerencial da semana</div>
                <div className="mt-1 text-xs text-white/60">
                  Totais consolidados consideram relatorios enviados como finais.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Equipe acompanhada: <strong>{teamRows.length}</strong>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50">
                    <th className="px-3 py-3 font-medium">Colaborador</th>
                    <th className="px-3 py-3 font-medium">Cargo</th>
                    <th className="px-3 py-3 font-medium">Peticoes</th>
                    <th className="px-3 py-3 font-medium">Audiencias</th>
                    <th className="px-3 py-3 font-medium">Clientes</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Observacoes</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-sm text-white/60">
                        Nenhum colaborador elegivel para relatorio semanal foi encontrado neste escritorio.
                      </td>
                    </tr>
                  ) : null}

                  {teamRows.map((row) => {
                    const report = row.report;
                    const status = report?.status === 'submitted' ? 'submitted' : report?.status === 'draft' ? 'draft' : 'missing';
                    return (
                      <tr key={row.user_id} className="border-b border-white/5 align-top text-white/80">
                        <td className="px-3 py-3">
                          <div className="font-medium text-white">{row.name}</div>
                          <div className="mt-1 text-xs text-white/50">{row.email || 'Sem e-mail'}</div>
                        </td>
                        <td className="px-3 py-3 capitalize text-white/60">{row.role || 'member'}</td>
                        <td className="px-3 py-3">{report?.petitions_filed ?? '-'}</td>
                        <td className="px-3 py-3">{report?.hearings_attended ?? '-'}</td>
                        <td className="px-3 py-3">{report?.clients_served ?? '-'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide',
                              badgeClass(status),
                            )}
                          >
                            {status === 'submitted' ? 'Enviado' : status === 'draft' ? 'Rascunho' : 'Devendo'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-white/60">{report?.notes?.trim() || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
