import { getMyOfficeId } from '@/lib/officeContext';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type ProductivityReport = {
  id: string;
  office_id: string;
  user_id: string;
  report_date: string;
  activities: ActivityItem[];
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  notes: string | null;
  status: 'enviado' | 'aprovado' | 'reprovado' | string;
  is_summary_only: boolean;
  manager_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
  created_at: string;
};

/** Structured activity item sent by collaborators via the activity form. */
export type ActivityItem = {
  title?: string;
  /** Canonical status field used by the new submission form. */
  status?: 'concluida' | 'pendente';
  /** Legacy flag kept for backwards-compat when status is absent. */
  done?: boolean;
  category?: string;
  type?: string;
  client_name?: string;
  /** Legacy compat fields */
  client?: string;
  process?: string;
  processo?: string;
  observation?: string;
  observacao?: string;
  description?: string;
  time_spent?: string;
  /** Legacy time field */
  time?: string;
  [key: string]: unknown;
};

/** Returns true when an activity is considered completed. */
export function isActivityDone(a: ActivityItem): boolean {
  if (a.status === 'concluida') return true;
  if (a.status === 'pendente') return false;
  return Boolean(a.done);
}

export type TeamReportRow = ProductivityReport & {
  collaborator_name: string;
  collaborator_email: string | null;
};

export type TeamReportFilters = {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
};

export type TeamReportSummary = {
  total: number;
  usersCount: number;
  totalCompleted: number;
  avgCompletion: number;
};

export async function fetchTeamReports(filters: TeamReportFilters = {}): Promise<TeamReportRow[]> {
  const sb = requireSupabase();
  await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) return [];

  let query = sb
    .from('productivity_reports')
    .select('*')
    .eq('office_id', officeId)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.dateFrom) query = query.gte('report_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('report_date', filters.dateTo);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Fetch user profiles in batch
  const rows = (data || []) as ProductivityReport[];
  if (!rows.length) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles, error: pErr } = await sb
    .from('user_profiles')
    .select('user_id, display_name, email')
    .in('user_id', userIds)
    .limit(500);

  if (pErr) throw new Error(pErr.message);

  const profileMap = new Map<string, { display_name: string | null; email: string | null }>(
    (profiles || []).map((p: { user_id: string; display_name: string | null; email: string | null }) => [
      p.user_id,
      { display_name: p.display_name, email: p.email },
    ])
  );

  const enriched: TeamReportRow[] = rows.map((r) => {
    const prof = profileMap.get(r.user_id);
    const activities: ActivityItem[] = Array.isArray(r.activities) ? r.activities : [];

    // Compute real metrics from activity list when available; fall back to stored aggregates
    const totalTasks = activities.length > 0 ? activities.length : (r.total_tasks ?? 0);
    const completedTasks =
      activities.length > 0
        ? activities.filter(isActivityDone).length
        : (r.completed_tasks ?? 0);
    const pendingTasks = activities.length > 0 ? totalTasks - completedTasks : (r.pending_tasks ?? 0);

    return {
      ...r,
      activities,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      is_summary_only: Boolean(r.is_summary_only) || activities.length === 0,
      collaborator_name: prof?.display_name || prof?.email?.split('@')[0] || 'Desconhecido',
      collaborator_email: prof?.email || null,
    };
  });

  // Text search filter (client-side on name/notes)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    return enriched.filter(
      (r) =>
        r.collaborator_name.toLowerCase().includes(term) ||
        (r.notes || '').toLowerCase().includes(term)
    );
  }

  return enriched;
}

export async function submitActivityReport(payload: {
  report_date: string;
  activities: ActivityItem[];
  notes?: string;
}): Promise<void> {
  if (!payload.activities.length) {
    throw new Error('Adicione ao menos 1 atividade detalhada.');
  }

  const sb = requireSupabase();
  const user = await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) throw new Error('Escritório não encontrado.');

  const activities = payload.activities;
  const completedTasks = activities.filter(isActivityDone).length;

  const row = {
    office_id: officeId,
    user_id: user.id,
    report_date: payload.report_date,
    activities,
    total_tasks: activities.length,
    completed_tasks: completedTasks,
    pending_tasks: activities.length - completedTasks,
    notes: payload.notes?.trim() || null,
    status: 'enviado',
    is_summary_only: false,
  };

  // Upsert by (office_id, user_id, report_date) — avoids duplicates
  const { error } = await sb
    .from('productivity_reports')
    .upsert(row, { onConflict: 'office_id,user_id,report_date', ignoreDuplicates: false });

  if (error) throw new Error(error.message);
}

export async function fetchMyActivityReport(reportDate: string): Promise<ProductivityReport | null> {
  const sb = requireSupabase();
  const user = await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) return null;

  const { data, error } = await sb
    .from('productivity_reports')
    .select('*')
    .eq('office_id', officeId)
    .eq('user_id', user.id)
    .eq('report_date', reportDate)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const activities: ActivityItem[] = Array.isArray(data.activities) ? data.activities : [];
  return {
    ...data,
    activities,
    is_summary_only: Boolean(data.is_summary_only) || activities.length === 0,
  } as ProductivityReport;
}

export async function fetchMyActivityReports(limit = 30): Promise<ProductivityReport[]> {
  const sb = requireSupabase();
  const user = await getAuthedUser();
  const officeId = await getMyOfficeId();
  if (!officeId) return [];

  const { data, error } = await sb
    .from('productivity_reports')
    .select('*')
    .eq('office_id', officeId)
    .eq('user_id', user.id)
    .order('report_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data || []) as ProductivityReport[]).map((r) => {
    const activities: ActivityItem[] = Array.isArray(r.activities) ? r.activities : [];
    return {
      ...r,
      activities,
      is_summary_only: Boolean(r.is_summary_only) || activities.length === 0,
    };
  });
}

export async function updateReportStatus(
  reportId: string,
  status: 'aprovado' | 'reprovado' | 'enviado',
  managerComment?: string,
  reviewedBy?: string
): Promise<void> {
  const sb = requireSupabase();
  await getAuthedUser();

  const payload: Record<string, unknown> = { status };
  if (managerComment !== undefined) payload.manager_comment = managerComment || null;
  if (reviewedBy) {
    payload.reviewed_by = reviewedBy;
    payload.reviewed_at = new Date().toISOString();
  }

  const { error } = await sb
    .from('productivity_reports')
    .update(payload)
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

export function computeSummary(reports: TeamReportRow[]): TeamReportSummary {
  const total = reports.length;
  const users = new Set(reports.map((r) => r.user_id));
  const totalCompleted = reports.reduce((acc, r) => acc + (r.completed_tasks || 0), 0);
  const totalTasks = reports.reduce((acc, r) => acc + (r.total_tasks || 0), 0);
  const avgCompletion = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return {
    total,
    usersCount: users.size,
    totalCompleted,
    avgCompletion,
  };
}
