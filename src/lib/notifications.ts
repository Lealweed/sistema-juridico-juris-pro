import { getMyOfficeId } from '@/lib/officeContext';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type SystemNotification = {
  id: string;
  user_id: string | null;
  office_id: string | null;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
};

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (limit?: number) => [...notificationKeys.all, 'list', limit ?? 'all'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

const relativeTimeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const relativeTimeDivisions = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
] as const satisfies ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }>;

function capitalize(text: string) {
  if (!text) return 'Info';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function getNotificationContext() {
  const sb = requireSupabase();
  const user = await getAuthedUser();
  const officeId = await getMyOfficeId().catch(() => null);
  return { sb, userId: user.id, officeId };
}

function applyNotificationScope<TQuery extends { eq: (column: string, value: string) => TQuery; or: (filters: string) => TQuery }>(
  query: TQuery,
  userId: string,
  officeId: string | null,
) {
  if (officeId) {
    return query.or(`user_id.eq.${userId},office_id.eq.${officeId}`);
  }

  return query.eq('user_id', userId);
}

export function formatNotificationRelativeTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Agora';

  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of relativeTimeDivisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return 'Agora';
}

export function formatNotificationDateTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Data indisponivel';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getNotificationTypeMeta(type: string | null | undefined) {
  const normalized = (type || 'info').trim().toLowerCase();

  switch (normalized) {
    case 'email':
      return {
        label: 'Email',
        className: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
      };
    case 'portal':
      return {
        label: 'Portal',
        className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
      };
    case 'alert':
      return {
        label: 'Alerta',
        className: 'border-red-400/25 bg-red-500/10 text-red-200',
      };
    default:
      return {
        label: capitalize(normalized),
        className: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
      };
  }
}

export async function listSystemNotifications(limit = 50): Promise<SystemNotification[]> {
  const { sb, userId, officeId } = await getNotificationContext();

  let query = sb
    .from('notifications')
    .select('id,user_id,office_id,title,message,type,is_read,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  query = applyNotificationScope(query, userId, officeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as SystemNotification[];
}

export async function listUnreadNotifications(limit = 20): Promise<SystemNotification[]> {
  const { sb, userId, officeId } = await getNotificationContext();

  let query = sb
    .from('notifications')
    .select('id,user_id,office_id,title,message,type,is_read,created_at')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  query = applyNotificationScope(query, userId, officeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as SystemNotification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const { sb, userId, officeId } = await getNotificationContext();

  let query = sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  query = applyNotificationScope(query, userId, officeId);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function markNotificationAsRead(notificationId: string) {
  const { sb, userId, officeId } = await getNotificationContext();

  let query = sb
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  query = applyNotificationScope(query, userId, officeId);

  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error('Notificacao nao encontrada ou sem permissao para atualiza-la.');
  }
}

export async function markAllNotificationsAsRead() {
  const unreadNotifications = await listUnreadNotifications(200);
  await Promise.all(unreadNotifications.map((notification) => markNotificationAsRead(notification.id)));
}
