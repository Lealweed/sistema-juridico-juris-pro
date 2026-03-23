import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type SystemNotification = {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
};

export const notificationKeys = {
  all: ['system_notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
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
  return { sb, userId: user.id };
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
        label: 'Alert',
        className: 'border-red-400/25 bg-red-500/10 text-red-200',
      };
    default:
      return {
        label: capitalize(normalized),
        className: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
      };
  }
}

export async function listSystemNotifications(limit = 100): Promise<SystemNotification[]> {
  const { sb, userId } = await getNotificationContext();

  const { data, error } = await sb
    .from('system_notifications')
    .select('id,user_id,title,message,type,is_read,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []) as SystemNotification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const { sb, userId } = await getNotificationContext();

  const { count, error } = await sb
    .from('system_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
  return count || 0;
}

export async function markAllNotificationsAsRead() {
  const { sb, userId } = await getNotificationContext();

  const { error } = await sb
    .from('system_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
}
