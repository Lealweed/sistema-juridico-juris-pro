import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  countUnreadNotifications,
  formatNotificationRelativeTime,
  getNotificationTypeMeta,
  listSystemNotifications,
  markNotificationAsRead,
  notificationKeys,
  type SystemNotification,
} from '@/lib/notifications';
import { cn } from '@/ui/utils/cn';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: notificationKeys.list(8),
    queryFn: () => listSystemNotifications(8),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const unreadCountQuery = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: countUnreadNotifications,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: async (_, notificationId) => {
      const markItemAsRead = (current?: SystemNotification[]) =>
        current?.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification,
        );

      queryClient.setQueryData<SystemNotification[] | undefined>(notificationKeys.list(8), markItemAsRead);
      queryClient.setQueryData<SystemNotification[] | undefined>(notificationKeys.list(), markItemAsRead);
      queryClient.setQueryData<number | undefined>(notificationKeys.unreadCount(), (current) =>
        Math.max(0, (current ?? unreadCountQuery.data ?? 1) - 1),
      );

      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const notifications = notificationsQuery.data || [];
  const unreadCount = unreadCountQuery.data ?? notifications.filter((notification) => !notification.is_read).length;
  const hasUnread = unreadCount > 0;
  const label = hasUnread ? `Notificacoes, ${unreadCount} nao lidas` : 'Notificacoes';
  const queryError = notificationsQuery.error
    ? getErrorMessage(notificationsQuery.error, 'Falha ao carregar notificacoes.')
    : null;
  const mutationError = markAsReadMutation.error
    ? getErrorMessage(markAsReadMutation.error, 'Falha ao marcar notificacao como lida.')
    : null;

  return (
    <div ref={bellRef} className="relative">
      <button
        type="button"
        className="relative rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition-colors hover:bg-white/10"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" />
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[22rem] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">Central de notificacoes</div>
              <div className="text-xs text-white/50">{hasUnread ? `${unreadCount} nao lidas` : 'Tudo em dia'}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigate('/app/notificacoes');
                setOpen(false);
              }}
              className="text-xs font-medium text-amber-200 hover:text-amber-100"
            >
              Ver todas
            </button>
          </div>

          {queryError || mutationError ? (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-100">
              {queryError || mutationError}
            </div>
          ) : null}

          <div className="max-h-[26rem] overflow-y-auto">
            {notificationsQuery.isPending ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando notificacoes...
              </div>
            ) : null}

            {!notificationsQuery.isPending && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/60">
                Nenhuma notificacao recente encontrada.
              </div>
            ) : null}

            {!notificationsQuery.isPending
              ? notifications.map((notification) => {
                  const typeMeta = getNotificationTypeMeta(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5',
                        !notification.is_read && 'bg-amber-400/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]', typeMeta.className)}>
                              {typeMeta.label}
                            </span>
                            {!notification.is_read ? (
                              <span className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100">
                                Nova
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white">{notification.title}</div>
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-white/65">{notification.message}</p>
                          <div className="mt-2 text-[11px] text-white/45">{formatNotificationRelativeTime(notification.created_at)}</div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigate('/app/notificacoes');
                              setOpen(false);
                            }}
                            className="text-[11px] font-medium text-amber-200 hover:text-amber-100"
                          >
                            Abrir
                          </button>

                          {!notification.is_read ? (
                            <button
                              type="button"
                              onClick={() => {
                                void markAsReadMutation.mutate(notification.id);
                              }}
                              disabled={markAsReadMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              Lida
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
