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
  manager_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
  created_at: string;
};

export type ActivityItem = {
  title?: string;
  description?: string;
  observation?: string;
  observacao?: string;
  done?: boolean;
  client?: string;
  process?: string;
  processo?: string;
  category?: string;
  type?: string;
  time?: string;
  [key: string]: unknown;
};

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
    return {
      ...r,
      activities: Array.isArray(r.activities) ? r.activities : [],
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
