import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type AuditLogRow = {
  id: string;
  office_id: string | null;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  client_id: string | null;
  case_id: string | null;
  task_id: string | null;
  created_at: string;
  before_data: any | null;
  after_data: any | null;
  profile?: {
    email: string | null;
    display_name: string | null;
  }[] | null;
};

export async function listAuditLogs(args?: {
  limit?: number;
  tableName?: string;
  recordId?: string;
  clientId?: string;
  caseId?: string;
  taskId?: string;
}) {
  const sb = requireSupabase();
  await getAuthedUser();

  let q = sb
    .from('audit_logs')
    .select('id,office_id,user_id,action,table_name,record_id,client_id,case_id,task_id,created_at,before_data,after_data')
    .order('created_at', { ascending: false })
    .limit(args?.limit ?? 30);

  if (args?.tableName) q = q.eq('table_name', args.tableName);
  if (args?.recordId) q = q.eq('record_id', args.recordId);
  if (args?.clientId) q = q.eq('client_id', args.clientId);
  if (args?.caseId) q = q.eq('case_id', args.caseId);
  if (args?.taskId) q = q.eq('task_id', args.taskId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data || []) as AuditLogRow[];
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]),
  );

  if (!userIds.length) return rows;

  // Avoid PostgREST embedded relationship errors by fetching profiles separately.
  const { data: profs, error: pErr } = await sb
    .from('user_profiles')
    .select('user_id,email,display_name')
    .in('user_id', userIds)
    .limit(500);

  if (pErr) return rows;

  const map = new Map((profs || []).map((p: any) => [p.user_id, p]));
  return rows.map((r) => {
    const p = r.user_id ? map.get(r.user_id) : null;
    return {
      ...r,
      profile: p ? [{ email: p.email ?? null, display_name: p.display_name ?? null }] : null,
    } as AuditLogRow;
  });
}
