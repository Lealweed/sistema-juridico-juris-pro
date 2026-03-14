import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/ui/widgets/Card';
import { getMyOfficeRole } from '@/lib/roles';
import { getMyOfficeId } from '@/lib/officeContext';
import { createAgenda, listAgendas, type AgendaRow } from '@/lib/agendas';
import { listOfficeMemberProfiles, type OfficeMemberProfile } from '@/lib/officeContext';
import { getOfficeSettings } from '@/lib/officeSettings';
import { loadClientsLite } from '@/lib/loadClientsLite';
import { loadCasesLite, type CaseLite } from '@/lib/loadCasesLite';
import type { ClientLite } from '@/lib/types';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type AgendaItem = {
  id: string;
  kind: 'commitment' | 'deadline' | string;
  title: string;
  notes: string | null;
  location: string | null;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  due_date: string | null;
  status: 'confirmed' | 'cancelled' | 'done' | string;
  agenda_id: string | null;
  created_at: string;
  responsible_user_id: string | null;
  last_responsible_by_user_id?: string | null;
  last_responsible_at?: string | null;
  client_id: string | null;
  case_id: string | null;
};

type ViewMode = 'today' | 'week' | 'month';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfWeek(d: Date) {
  // Monday-based week
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const x = new Date(d);
  x.setDate(d.getDate() + diff);
  return startOfDay(x);
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMonthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function toDatetimeLocalValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function AgendaPage() {
  const [rows, setRows] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string>('');
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [agendas, setAgendas] = useState<AgendaRow[]>([]);
  const [selectedAgendaIds, setSelectedAgendaIds] = useState<string[]>([]);

  const [createAgendaOpen, setCreateAgendaOpen] = useState(false);
  const [agendaName, setAgendaName] = useState('');
  const [agendaColor, setAgendaColor] = useState('#f59e0b');

  const [view, setView] = useState<ViewMode>('today');
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<'commitment' | 'deadline'>('commitment');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<OfficeMemberProfile[]>([]);
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('all');

  const [scope, setScope] = useState<'inbox' | 'outbox'>('inbox');

  const [clientsLite, setClientsLite] = useState<ClientLite[]>([]);
  const [casesLite, setCasesLite] = useState<CaseLite[]>([]);
  const [linkClientId, setLinkClientId] = useState('');
  const [linkCaseId, setLinkCaseId] = useState('');

  const [remindersOpen, setRemindersOpen] = useState<null | { item: AgendaItem }>(null);
  const [reminders, setReminders] = useState<any[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remSendAt, setRemSendAt] = useState('');
  const [remTarget, setRemTarget] = useState<'responsible' | 'custom'>('responsible');
  const [remPhone, setRemPhone] = useState('');
  const [remMessage, setRemMessage] = useState('');

  const [delegatingItemId, setDelegatingItemId] = useState<string | null>(null);
  const [delegateTo, setDelegateTo] = useState('');

  const range = useMemo(() => {
    const now = new Date();

    if (view === 'today') {
      return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
    }

    if (view === 'week') {
      const s = startOfWeek(now);
      const e = endOfDay(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6));
      return { start: s, end: e, label: 'Semana' };
    }

    // month
    const s = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const e = endOfDay(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0));
    return { start: s, end: e, label: 'Mês' };
  }, [view, monthCursor]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      // role + office + agendas + lite lookups
      const [r, oid, ags, clLite, csLite] = await Promise.all([
        getMyOfficeRole().catch(() => ''),
        getMyOfficeId().catch(() => null),
        listAgendas().catch(() => [] as AgendaRow[]),
        loadClientsLite().catch(() => [] as ClientLite[]),
        loadCasesLite().catch(() => [] as CaseLite[]),
      ]);
      setRole(r);
      setOfficeId(oid);
      setAgendas(ags);
      setClientsLite(clLite);
      setCasesLite(csLite);

      // members (for responsible dropdown/filter)
      if (oid) {
        const ms = await listOfficeMemberProfiles(oid).catch(() => []);
        setMembers(ms);
      }

      // default selected agendas (all)
      if (!selectedAgendaIds.length && ags.length) {
        setSelectedAgendaIds(ags.map((a) => a.id));
      }

      const startDate = toDateStr(range.start);
      const endDate = toDateStr(range.end);
      const startIso = range.start.toISOString();
      const endIso = range.end.toISOString();

      const orFilter = [
        `and(kind.eq.deadline,due_date.gte.${startDate},due_date.lte.${endDate})`,
        `and(kind.eq.commitment,starts_at.gte.${startIso},starts_at.lte.${endIso})`,
      ].join(',');

      let q = sb
        .from('agenda_items')
        .select('id,kind,title,notes,location,all_day,starts_at,ends_at,due_date,status,agenda_id,created_at,responsible_user_id,last_responsible_by_user_id,last_responsible_at,client_id,case_id')
        .or(orFilter)
        .order('created_at', { ascending: false })
        .limit(500);

      if (selectedAgendaIds.length) {
        q = q.in('agenda_id', selectedAgendaIds);
      }

      if (r === 'admin' && responsibleFilter !== 'all') {
        q = q.eq('responsible_user_id', responsibleFilter);
      }

      if (scope === 'outbox') {
        // items I delegated (requires RLS allowing last_responsible_by_user_id)
        const me = (await getAuthedUser()).id;
        q = q.eq('last_responsible_by_user_id', me).neq('responsible_user_id', me);
      }

      const { data, error: qErr } = await q;

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as AgendaItem[]);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar agenda.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, monthCursor.getTime(), selectedAgendaIds.join('|'), scope]);

  async function onCreate() {
    if (!title.trim()) return;
    if (!selectedAgendaIds.length) {
      setError('Selecione ao menos uma agenda.');
      return;
    }

    if (kind === 'commitment') {
      if (!startsAt) {
        setError('Informe o início do compromisso.');
        return;
      }
      if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
        setError('O fim não pode ser antes do início.');
        return;
      }
    }

    if (kind === 'deadline' && !dueDate) {
      setError('Informe a data do prazo.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      const payload: any = {
        user_id: user.id,
        kind,
        title: title.trim(),
        notes: notes.trim() || null,
        location: location.trim() || null,
        all_day: allDay,
        status: 'confirmed',
        agenda_id: selectedAgendaIds[0] || null,
        responsible_user_id: responsibleUserId || user.id,
        client_id: linkClientId || null,
        case_id: linkCaseId || null,
      };

      if (kind === 'commitment') {
        payload.starts_at = startsAt ? new Date(startsAt).toISOString() : null;
        payload.ends_at = endsAt ? new Date(endsAt).toISOString() : null;
        payload.due_date = null;
      } else {
        payload.due_date = dueDate;
        payload.starts_at = null;
        payload.ends_at = null;
      }

      const { data: created, error: iErr } = await sb.from('agenda_items').insert(payload).select('id,office_id,kind,title,starts_at,due_date').single();
      if (iErr) throw new Error(iErr.message);

      // Auto reminder defaults (per office)
      if (created?.office_id) {
        try {
          const settings = await getOfficeSettings(created.office_id);

          let sendAt: string | null = null;
          if (created.kind === 'commitment' && created.starts_at) {
            const start = new Date(created.starts_at).getTime();
            const mins = Number(settings.agenda_commitment_default_minutes_before || 0);
            sendAt = new Date(start - mins * 60_000).toISOString();
          }

          if (created.kind === 'deadline' && created.due_date) {
            const hhmm = String(settings.agenda_deadline_default_time || '09:00').slice(0, 5);
            // Office timezone support will be refined later; for now this uses local time.
            sendAt = new Date(`${created.due_date}T${hhmm}:00`).toISOString();
          }

          if (sendAt) {
            const msg =
              created.kind === 'deadline'
                ? `Lembrete (prazo): ${created.title} · Data ${created.due_date}`
                : `Lembrete (compromisso): ${created.title}`;

            const inserts: any[] = [];

            // 1) responsável (ou criador)
            inserts.push({
              office_id: created.office_id,
              agenda_item_id: created.id,
              channel: 'whatsapp',
              to_kind: 'internal',
              to_user_id: user.id,
              to_phone: null,
              message: msg,
              send_at: sendAt,
              status: 'pending',
            });

            // 2) escritório (número fixo)
            const officePhone = settings.office_whatsapp;
            if (officePhone) {
              inserts.push({
                office_id: created.office_id,
                agenda_item_id: created.id,
                channel: 'whatsapp',
                to_kind: 'custom',
                to_user_id: null,
                to_phone: String(officePhone),
                message: msg,
                send_at: sendAt,
                status: 'pending',
              });
            }

            await sb.from('agenda_reminders').insert(inserts);
          }
        } catch {
          // ignore auto reminder failures
        }
      }

      setCreateOpen(false);
      setKind('commitment');
      setTitle('');
      setNotes('');
      setLocation('');
      setAllDay(false);
      setStartsAt('');
      setEndsAt('');
      setDueDate('');
      setLinkClientId('');
      setLinkCaseId('');
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar item na agenda.');
      setSaving(false);
    }
  }

  async function openReminders(item: AgendaItem) {
    setRemindersOpen({ item });
    setReminders([]);
    setRemindersLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { data, error } = await sb
        .from('agenda_reminders')
        .select('id,channel,to_kind,to_phone,to_user_id,to_client_id,message,send_at,status,sent_at,last_error,created_at')
        .eq('agenda_item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new Error(error.message);
      setReminders(data ?? []);

      // Defaults for new reminder
      setRemSendAt('');
      setRemTarget('responsible');
      setRemPhone('');
      setRemMessage(
        item.kind === 'deadline'
          ? `Lembrete (prazo): ${item.title} · Data ${item.due_date || ''}`
          : `Lembrete (compromisso): ${item.title}`,
      );
      setRemindersLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar lembretes.');
      setRemindersLoading(false);
    }
  }

  async function addReminder() {
    if (!remindersOpen) return;
    if (!remSendAt) {
      setError('Informe data/hora do lembrete.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      const office_id = officeId;
      if (!office_id) throw new Error('Escritório não encontrado.');

      const item = remindersOpen.item;
      const sendAtIso = new Date(remSendAt).toISOString();

      const payload: any = {
        office_id,
        agenda_item_id: item.id,
        channel: 'whatsapp',
        message: remMessage.trim() || 'Lembrete',
        send_at: sendAtIso,
        status: 'pending',
        to_kind: remTarget === 'custom' ? 'custom' : 'internal',
        to_phone: remTarget === 'custom' ? (remPhone.trim() || null) : null,
        to_user_id: remTarget === 'responsible' ? item.responsible_user_id || user.id : null,
        to_client_id: null,
      };

      if (remTarget === 'custom' && !payload.to_phone) {
        throw new Error('Informe o telefone do destinatário.');
      }

      const { error } = await sb.from('agenda_reminders').insert(payload);
      if (error) throw new Error(error.message);

      setSaving(false);
      await openReminders(item);
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar lembrete.');
      setSaving(false);
    }
  }

  async function deleteReminder(id: string) {
    if (!confirm('Excluir este lembrete?')) return;
    setSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error } = await sb.from('agenda_reminders').delete().eq('id', id);
      if (error) throw new Error(error.message);

      setSaving(false);
      if (remindersOpen) await openReminders(remindersOpen.item);
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir lembrete.');
      setSaving(false);
    }
  }

  async function delegateAgendaItem(item: AgendaItem, toUserId: string) {
    if (!toUserId) return;
    setDelegatingItemId(item.id);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error } = await sb.rpc('delegate_agenda_item', {
        p_agenda_item_id: item.id,
        p_responsible_user_id: toUserId,
      });

      if (error) throw new Error(error.message);
      setDelegatingItemId(null);
      setDelegateTo('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao delegar item.');
      setDelegatingItemId(null);
    }
  }

  async function onCreateAgenda() {
    if (!officeId) {
      setError('Escritório não encontrado.');
      return;
    }
    if (!agendaName.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await createAgenda({ officeId, name: agendaName, color: agendaColor, kind: 'shared' });
      setCreateAgendaOpen(false);
      setAgendaName('');
      setAgendaColor('#f59e0b');
      setSaving(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar agenda.');
      setSaving(false);
    }
  }

  const agendaMap = useMemo(() => new Map(agendas.map((a) => [a.id, a] as const)), [agendas]);

  const itemsSorted = useMemo(() => {
    const score = (it: AgendaItem) => {
      if (it.kind === 'deadline') return it.due_date ? new Date(it.due_date + 'T00:00:00').getTime() : 0;
      return it.starts_at ? new Date(it.starts_at).getTime() : 0;
    };

    return [...rows].sort((a, b) => score(a) - score(b));
  }, [rows]);

  const monthItemsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const it of rows) {
      const key =
        it.kind === 'deadline'
          ? it.due_date
          : it.starts_at
            ? toDateStr(new Date(it.starts_at))
            : null;
      if (!key) continue;
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  const monthGrid = useMemo(() => {
    if (view !== 'month') return null;

    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();

    const firstDow = (first.getDay() + 6) % 7; // Monday=0..Sunday=6

    const map = monthItemsByDay;

    const cells: Array<{ day: number | null; key: string | null; count: number; hasDeadline: boolean; isSelected: boolean }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, key: null, count: 0, hasDeadline: false, isSelected: false });
    for (let day = 1; day <= lastDay; day++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(day)}`;
      const list = map.get(key) || [];
      cells.push({
        day,
        key,
        count: list.length,
        hasDeadline: list.some((x) => x.kind === 'deadline'),
        isSelected: selectedDayKey === key,
      });
    }

    return { cells };
  }, [view, monthCursor, monthItemsByDay, selectedDayKey]);

  const selectedDayItems = useMemo(() => {
    if (!selectedDayKey) return [] as AgendaItem[];
    const list = monthItemsByDay.get(selectedDayKey) || [];
    return [...list].sort((a, b) => {
      const ta = a.kind === 'deadline' ? new Date(`${a.due_date}T00:00:00`).getTime() : new Date(a.starts_at || 0).getTime();
      const tb = b.kind === 'deadline' ? new Date(`${b.due_date}T00:00:00`).getTime() : new Date(b.starts_at || 0).getTime();
      return ta - tb;
    });
  }, [selectedDayKey, monthItemsByDay]);

  function openCreateForDay(dayKey: string) {
    setSelectedDayKey(dayKey);
    const base = new Date(`${dayKey}T09:00:00`);
    const end = new Date(`${dayKey}T10:00:00`);
    setKind('commitment');
    setStartsAt(toDatetimeLocalValue(base));
    setEndsAt(toDatetimeLocalValue(end));
    setDueDate(dayKey);
    setCreateOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agenda</h1>
          <p className="text-sm text-white/60">Hoje · Semana · Mês</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {role === 'admin' ? (
            <select
              className="select !mt-0"
              value={responsibleFilter}
              onChange={(e) => setResponsibleFilter(e.target.value)}
              title="Filtrar por responsável"
            >
              <option value="all">Todos responsáveis</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.email || m.user_id}
                </option>
              ))}
            </select>
          ) : null}

          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(
              [
                { id: 'inbox', label: 'Entrada' },
                { id: 'outbox', label: 'Saída' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setScope(t.id)}
                className={
                  'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ' +
                  (scope === t.id ? 'bg-white text-neutral-950' : 'text-white/70 hover:text-white')
                }
                title={t.id === 'outbox' ? 'Itens delegados por você (caixa de saída)' : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(
              [
                { id: 'today', label: 'Hoje' },
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Mês' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={
                  'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ' +
                  (view === t.id ? 'bg-white text-neutral-950' : 'text-white/70 hover:text-white')
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {view === 'month' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedDayKey(null);
                  setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1));
                }}
                className="btn-ghost"
              >
                ‹
              </button>
              <div className="min-w-[180px] text-center text-sm font-semibold text-white">
                {fmtMonthLabel(monthCursor)}
              </div>
              <button
                onClick={() => {
                  setSelectedDayKey(null);
                  setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1));
                }}
                className="btn-ghost"
              >
                ›
              </button>
            </div>
          ) : null}

          {true ? (
            <button onClick={() => setCreateAgendaOpen(true)} className="btn-ghost">
              Nova agenda
            </button>
          ) : null}

          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            Novo
          </button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Agendas</div>
            <div className="text-xs text-white/60">Marque quais agendas você quer visualizar.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
              onClick={() => setSelectedAgendaIds(agendas.map((a) => a.id))}
            >
              Ver todas
            </button>
            <button
              type="button"
              className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
              onClick={() => setSelectedAgendaIds([])}
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {agendas.map((a) => {
            const checked = selectedAgendaIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedAgendaIds((prev) =>
                    prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                  );
                }}
                className={
                  'rounded-xl border px-3 py-1.5 text-sm font-semibold ' +
                  (checked ? 'bg-white text-neutral-950 border-white/10' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10')
                }
                title={a.name}
              >
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                {a.name}
              </button>
            );
          })}
          {!agendas.length ? <div className="text-sm text-white/60">Nenhuma agenda encontrada.</div> : null}
        </div>
      </Card>

      {createAgendaOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Nova agenda</div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="md:col-span-2 text-sm text-white/80">
                Nome
                <input className="input" value={agendaName} onChange={(e) => setAgendaName(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Cor
                <input className="input" type="color" value={agendaColor} onChange={(e) => setAgendaColor(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={() => void onCreateAgenda()} className="btn-primary">
                {saving ? 'Salvando…' : 'Criar'}
              </button>
              <button disabled={saving} onClick={() => setCreateAgendaOpen(false)} className="btn-ghost">
                Cancelar
              </button>
            </div>

            {error ? <div className="text-sm text-red-200">{error}</div> : null}
          </div>
        </Card>
      ) : null}

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Novo item</div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-white/80">
                Tipo
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'commitment' | 'deadline')}>
                  <option value="commitment">Compromisso</option>
                  <option value="deadline">Prazo</option>
                </select>
              </label>
              <label className="md:col-span-2 text-sm text-white/80">
                Título
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="md:col-span-3 text-sm text-white/80">
                Responsável
                <select className="select" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
                  <option value="">Eu</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email || m.user_id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {kind === 'commitment' ? (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm text-white/80">
                  Início
                  <input
                    type="datetime-local"
                    className="input"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label className="text-sm text-white/80">
                  Fim
                  <input
                    type="datetime-local"
                    className="input"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-white/80 md:mt-7">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Dia inteiro
                </label>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm text-white/80">
                  Data do prazo
                  <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Local
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
              </label>
              <label className="text-sm text-white/80">
                Observações
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Cliente (opcional)
                <select className="select" value={linkClientId} onChange={(e) => setLinkClientId(e.target.value)}>
                  <option value="">—</option>
                  {clientsLite.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-white/80">
                Caso (opcional)
                <select className="select" value={linkCaseId} onChange={(e) => setLinkCaseId(e.target.value)}>
                  <option value="">—</option>
                  {casesLite
                    .filter((c) => (!linkClientId ? true : c.client_id === linkClientId))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={onCreate} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button disabled={saving} onClick={() => setCreateOpen(false)} className="btn-ghost">
                Cancelar
              </button>
            </div>

            {error ? <div className="text-sm text-red-200">{error}</div> : null}
          </div>
        </Card>
      ) : null}

      {view === 'month' && monthGrid ? (
        <Card>
          <div className="grid grid-cols-7 gap-2 text-xs text-white/60">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="px-2 py-1 text-center font-semibold text-white/70">
                {d}
              </div>
            ))}

            {monthGrid.cells.map((c, idx) => (
              <button
                key={c.key || `empty-${idx}`}
                type="button"
                onClick={() => {
                  if (!c.key) return;
                  setSelectedDayKey(c.key);
                }}
                onDoubleClick={() => {
                  if (!c.key) return;
                  openCreateForDay(c.key);
                }}
                className={
                  'min-h-[64px] rounded-xl border p-2 text-left transition ' +
                  (c.day
                    ? c.isSelected
                      ? 'border-white/30 bg-white/15 text-white'
                      : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                    : 'border-white/10 bg-white/5 opacity-30')
                }
                title={c.key ? `Clique para ver dia • duplo clique para novo item (${c.key})` : undefined}
              >
                {c.day ? (
                  <div className="flex items-start justify-between">
                    <div className="text-xs font-semibold text-white/80">{c.day}</div>
                    {c.count ? (
                      <div
                        className={
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                          (c.hasDeadline ? 'bg-amber-300/15 text-amber-200' : 'bg-white/10 text-white/70')
                        }
                      >
                        {c.count}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
          <div className="mt-4 text-xs text-white/50">
            Dica: clique no dia para ver os itens e dê duplo clique para criar um novo evento já com a data preenchida.
          </div>

          {selectedDayKey ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">Dia selecionado: {selectedDayKey}</div>
                <button type="button" className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" onClick={() => openCreateForDay(selectedDayKey)}>
                  Novo nesse dia
                </button>
              </div>

              {selectedDayItems.length ? (
                <div className="grid gap-2">
                  {selectedDayItems.map((it) => (
                    <div key={it.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                      <span className="font-semibold text-white">{it.title}</span>
                      <span className="ml-2 badge">{it.kind === 'deadline' ? 'Prazo' : 'Compromisso'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-white/60">Sem itens nesse dia.</div>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {error && !createOpen ? <div className="text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <div className="grid gap-2">
            {itemsSorted.map((it) => (
              <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {it.title} <span className="badge">{it.kind === 'deadline' ? 'Prazo' : 'Compromisso'}</span>
                      {it.agenda_id && agendaMap.get(it.agenda_id) ? (
                        <span
                          className="ml-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/80"
                          title={agendaMap.get(it.agenda_id)!.name}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: agendaMap.get(it.agenda_id)!.color }} />
                          {agendaMap.get(it.agenda_id)!.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {it.kind === 'deadline'
                        ? `Data: ${it.due_date || '—'}`
                        : `Início: ${fmtDateTime(it.starts_at)}${it.ends_at ? ` · Fim: ${fmtDateTime(it.ends_at)}` : ''}`}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/60">
                      {it.client_id ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          Cliente vinculado
                        </span>
                      ) : null}
                      {it.case_id ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          Caso vinculado
                        </span>
                      ) : null}
                    </div>
                    {it.location ? <div className="mt-1 text-xs text-white/50">Local: {it.location}</div> : null}
                    {it.notes ? <div className="mt-1 text-xs text-white/50">Obs: {it.notes}</div> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                      onClick={() => void openReminders(it)}
                      type="button"
                    >
                      Lembretes
                    </button>

                    {true ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="select !mt-0 !w-[200px]"
                          value={delegatingItemId === it.id ? delegateTo : ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDelegateTo(v);
                            if (v) void delegateAgendaItem(it, v);
                          }}
                          disabled={delegatingItemId === it.id}
                          title="Delegar para"
                        >
                          <option value="">Delegar…</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.display_name || m.email || m.user_id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div className="text-xs font-semibold text-white/60">{it.status}</div>
                  </div>
                </div>
              </div>
            ))}

            {itemsSorted.length === 0 ? <div className="text-sm text-white/60">Nada nesse período.</div> : null}
          </div>
        ) : null}
      </Card>

      {remindersOpen ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Lembretes</div>
              <div className="text-xs text-white/60">Item: {remindersOpen.item.title}</div>
            </div>
            <button className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" onClick={() => setRemindersOpen(null)}>
              Fechar
            </button>
          </div>

          {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}

          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Adicionar lembrete</div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Enviar em
                <input
                  type="datetime-local"
                  className="input"
                  value={remSendAt}
                  onChange={(e) => setRemSendAt(e.target.value)}
                />
              </label>

              <label className="text-sm text-white/80">
                Destino
                <select className="select" value={remTarget} onChange={(e) => setRemTarget(e.target.value as 'responsible' | 'custom')}>
                  <option value="responsible">Responsável</option>
                  <option value="custom">Número</option>
                </select>
              </label>

              {remTarget === 'custom' ? (
                <label className="md:col-span-2 text-sm text-white/80">
                  Telefone
                  <input className="input" value={remPhone} onChange={(e) => setRemPhone(e.target.value)} placeholder="Ex: +55 11 99999-9999" />
                </label>
              ) : null}

              <label className="md:col-span-2 text-sm text-white/80">
                Mensagem
                <input className="input" value={remMessage} onChange={(e) => setRemMessage(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={saving} onClick={() => void addReminder()}>
                {saving ? 'Salvando…' : 'Salvar lembrete'}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5">
            {remindersLoading ? <div className="p-4 text-sm text-white/70">Carregando…</div> : null}

            {!remindersLoading && reminders.length === 0 ? (
              <div className="p-4 text-sm text-white/60">Nenhum lembrete neste item.</div>
            ) : null}

            {!remindersLoading && reminders.length ? (
              <div className="divide-y divide-white/10">
                {reminders.map((r: any) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {new Date(r.send_at).toLocaleString()} · {String(r.status || '').toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-white/60">{r.message}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {r.to_kind === 'custom' ? `Para: ${r.to_phone || '—'}` : 'Para: responsável'}
                      </div>
                      {r.last_error ? <div className="mt-1 text-xs text-red-200">{r.last_error}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs"
                        disabled={saving}
                        onClick={() => void deleteReminder(r.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
