import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  FileText,
  Loader2,
  MessageSquareText,
  PlusCircle,
  Send,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { getMyOfficeRole } from '@/lib/roles';
import {
  fetchMyActivityReport,
  fetchMyActivityReports,
  isActivityDone,
  submitActivityReport,
  type ActivityItem,
  type ProductivityReport,
} from '@/lib/teamReports';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

/* ─── helpers ─── */

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value: string) {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function toSafeDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* ─── category options ─── */

const CATEGORIES = [
  'Atendimento',
  'Petição',
  'Audiência',
  'Diligência',
  'Financeiro',
  'Administrativo',
  'Reunião',
  'Outro',
];

/* ─── empty activity factory ─── */

function emptyActivity(): ActivityItem {
  return {
    title: '',
    status: 'concluida',
    category: '',
    client_name: '',
    observation: '',
    time_spent: '',
  };
}

/* ─── ActivityForm ─── */

function ActivityForm({
  item,
  index,
  onChange,
  onRemove,
  disabled,
}: {
  item: ActivityItem;
  index: number;
  onChange: (updated: ActivityItem) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5">
      {/* item header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({ ...item, status: item.status === 'concluida' ? 'pendente' : 'concluida' })
          }
          className="shrink-0"
          title="Alternar status"
        >
          {item.status === 'concluida' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <Circle className="h-5 w-5 text-white/30" />
          )}
        </button>

        <input
          type="text"
          value={item.title || ''}
          disabled={disabled}
          placeholder={`Atividade ${index + 1} — descreva brevemente o que foi feito`}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />

        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            item.status === 'concluida'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-200',
          )}
        >
          {item.status === 'concluida' ? 'concluída' : 'pendente'}
        </span>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-white/40 transition hover:text-white/70"
          title="Expandir detalhes"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="shrink-0 text-white/30 transition hover:text-red-400"
          title="Remover atividade"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* expanded details */}
      {expanded && (
        <div className="grid gap-3 border-t border-white/10 px-4 pb-4 pt-3 md:grid-cols-2">
          {/* category */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-white/50">
              <Tag className="h-3 w-3" /> Categoria
            </label>
            <select
              value={item.category || ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...item, category: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/40 disabled:opacity-60"
            >
              <option value="">Selecionar...</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* client */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-white/50">
              <Users className="h-3 w-3" /> Cliente (opcional)
            </label>
            <input
              type="text"
              value={item.client_name || ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...item, client_name: e.target.value })}
              placeholder="Nome do cliente"
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:opacity-60"
            />
          </div>

          {/* time_spent */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-white/50">
              <Clock className="h-3 w-3" /> Tempo gasto (opcional)
            </label>
            <input
              type="text"
              value={item.time_spent || ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...item, time_spent: e.target.value })}
              placeholder="Ex.: 2h30"
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:opacity-60"
            />
          </div>

          {/* observation */}
          <div className="md:col-span-2">
            <label className="mb-1 flex items-center gap-1.5 text-xs text-white/50">
              <MessageSquareText className="h-3 w-3" /> Observação (opcional)
            </label>
            <input
              type="text"
              value={item.observation || ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...item, observation: e.target.value })}
              placeholder="Detalhes adicionais, bloqueios, etc."
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:opacity-60"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MetricBadge ─── */

function MetricBadge({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
      <Icon className="h-4 w-4 text-white/40" />
      <div className="mt-1.5 text-xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
}

/* ─── HistoryItem ─── */

function HistoryItem({ report, onClick }: { report: ProductivityReport; onClick: () => void }) {
  const completed = report.activities.filter(isActivityDone).length;
  const total = report.activities.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{toSafeDate(report.report_date)}</div>
          <div className="mt-1 text-xs text-white/50">
            {total > 0
              ? `${total} atividades · ${completed} concluídas · ${pct}%`
              : 'Sem atividades detalhadas'}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase',
            report.status === 'aprovado'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : report.status === 'reprovado'
                ? 'border-red-400/30 bg-red-400/10 text-red-300'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-200',
          )}
        >
          {report.status === 'aprovado' ? 'Aprovado' : report.status === 'reprovado' ? 'Reprovado' : 'Enviado'}
        </span>
      </div>
    </button>
  );
}

/* ─── Main page ─── */

export function ActivityReportPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [currentReport, setCurrentReport] = useState<ProductivityReport | null>(null);
  const [history, setHistory] = useState<ProductivityReport[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([emptyActivity()]);
  const [notes, setNotes] = useState('');

  const isLocked = false;

  // boot
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [role, historyData] = await Promise.all([
          getMyOfficeRole().catch(() => ''),
          fetchMyActivityReports(30).catch(() => []),
        ]);
        if (!alive) return;
        const normalized = String(role).trim().toLowerCase();
        setIsAdmin(normalized === 'admin' || normalized === 'owner' || normalized === 'administrator');
        setHistory(historyData);
      } catch (err) {
        if (alive) setError(getErrorMessage(err, 'Não foi possível carregar o histórico.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // load report for selected date
  useEffect(() => {
    let alive = true;
    (async () => {
      setError(null);
      setSubmitError(null);
      setSuccessMsg(null);
      try {
        const report = await fetchMyActivityReport(selectedDate);
        if (!alive) return;
        setCurrentReport(report);
        if (report) {
          setActivities(report.activities.length ? report.activities : [emptyActivity()]);
          setNotes(report.notes || '');
        } else {
          setActivities([emptyActivity()]);
          setNotes('');
        }
      } catch (err) {
        if (alive) setError(getErrorMessage(err, 'Não foi possível carregar o relatório.'));
      }
    })();
    return () => { alive = false; };
  }, [selectedDate]);

  const completedCount = useMemo(() => activities.filter(isActivityDone).length, [activities]);
  const pendingCount = useMemo(() => activities.length - completedCount, [activities, completedCount]);

  function addActivity() {
    setActivities((prev) => [...prev, emptyActivity()]);
    setSubmitError(null);
  }

  function updateActivity(index: number, updated: ActivityItem) {
    setActivities((prev) => prev.map((a, i) => (i === index ? updated : a)));
  }

  function removeActivity(index: number) {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSuccessMsg(null);

    const filled = activities.filter((a) => String(a.title || '').trim().length > 0);
    if (filled.length === 0) {
      setSubmitError('Adicione ao menos 1 atividade detalhada.');
      return;
    }

    setSaving(true);
    try {
      await submitActivityReport({
        report_date: selectedDate,
        activities: filled,
        notes,
      });
      setSuccessMsg('✅ Relatório enviado com sucesso!');
      // reload
      const updated = await fetchMyActivityReport(selectedDate);
      setCurrentReport(updated);
      const updatedHistory = await fetchMyActivityReports(30);
      setHistory(updatedHistory);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Não foi possível enviar o relatório.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  // admins are redirected to management view
  if (isAdmin) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-6 py-4 text-sm text-amber-200">
          Como gestor, você visualiza os relatórios da equipe em{' '}
          <a href="/app/relatorios-equipe" className="underline underline-offset-2">
            Relatórios da Equipe
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      {/* page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Relatório de Atividades</h1>
        <p className="mt-1 text-sm text-white/55">
          Registre as atividades realizadas no dia para a gestão validar sua produtividade.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* date selector + status */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            <label htmlFor="report-date" className="text-sm font-medium text-white">
              Data do relatório
            </label>
          </div>
          <input
            id="report-date"
            type="date"
            value={selectedDate}
            max={todayIso()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-1.5 text-sm text-white outline-none transition focus:border-amber-400/40"
          />
        </div>

        {currentReport && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <FileText className="h-3.5 w-3.5 text-white/40" />
            <span className="text-xs text-white/60">
              Relatório existente para {fmtDate(selectedDate)} ·{' '}
              <span
                className={
                  currentReport.status === 'aprovado'
                    ? 'text-emerald-400'
                    : currentReport.status === 'reprovado'
                      ? 'text-red-400'
                      : 'text-amber-300'
                }
              >
                {currentReport.status === 'aprovado'
                  ? 'Aprovado'
                  : currentReport.status === 'reprovado'
                    ? 'Reprovado — pode ser reenviado'
                    : 'Enviado · aguardando revisão'}
              </span>
            </span>
            {isLocked && (
              <span className="ml-auto text-xs text-white/30">(você pode corrigir e reenviar)</span>
            )}
          </div>
        )}
      </Card>

      {/* metrics preview */}
      {activities.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <MetricBadge icon={FileText} label="Total" value={activities.length} />
          <MetricBadge icon={CheckCircle2} label="Concluídas" value={completedCount} />
          <MetricBadge icon={Circle} label="Pendentes" value={pendingCount} />
        </div>
      )}

      {/* activity list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Atividades{' '}
            <span className="ml-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-normal text-white/50">
              {activities.length}
            </span>
          </h2>
          {!isLocked && (
            <button
              type="button"
              onClick={addActivity}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Adicionar atividade
            </button>
          )}
        </div>

        {activities.map((item, idx) => (
          <ActivityForm
            key={idx}
            item={item}
            index={idx}
            disabled={isLocked || saving}
            onChange={(updated) => updateActivity(idx, updated)}
            onRemove={() => removeActivity(idx)}
          />
        ))}

        {activities.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
            <p className="text-sm text-white/40">
              Nenhuma atividade adicionada. Use o botão acima para inclusão.
            </p>
          </div>
        )}
      </div>

      {/* notes */}
      <Card>
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-amber-300" />
          <span className="text-sm font-medium text-white">Observações gerais (opcional)</span>
        </div>
        <textarea
          rows={3}
          value={notes}
          disabled={isLocked || saving}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bloqueios, riscos, dependências ou contexto relevante para o gestor."
          className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </Card>

      {/* validation messages */}
      {submitError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* submit */}
      {!isLocked && (
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? 'Enviando...' : 'Enviar Relatório'}
        </button>
      )}

      {/* history */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Histórico</h2>
          {history.map((r) => (
            <HistoryItem
              key={r.id}
              report={r}
              onClick={() => setSelectedDate(r.report_date)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
