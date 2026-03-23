import { Bell, CheckCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  formatNotificationDateTime,
  formatNotificationRelativeTime,
  getNotificationTypeMeta,
  listSystemNotifications,
  markAllNotificationsAsRead,
  notificationKeys,
  type SystemNotification,
} from '@/lib/notifications';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => listSystemNotifications(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: async () => {
      queryClient.setQueryData<SystemNotification[] | undefined>(notificationKeys.list(), (current) =>
        current?.map((notification) => ({ ...notification, is_read: true })),
      );
      queryClient.setQueryData(notificationKeys.unreadCount(), 0);

      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const notifications = notificationsQuery.data || [];
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const readCount = notifications.length - unreadCount;
  const isLoading = notificationsQuery.isPending;
  const queryError = notificationsQuery.error ? getErrorMessage(notificationsQuery.error, 'Falha ao carregar notificacoes.') : null;
  const mutationError = markAllMutation.error
    ? getErrorMessage(markAllMutation.error, 'Falha ao marcar notificacoes como lidas.')
    : null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10">
                <Bell className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">Central de Notificacoes</h1>
                <p className="text-sm text-white/60">
                  Alertas mais recentes do sistema, com foco em email, portal e eventos criticos.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={isLoading || unreadCount === 0 || markAllMutation.isPending}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCheck className="h-4 w-4" />
            {markAllMutation.isPending ? 'Marcando...' : 'Marcar todas como lidas'}
          </button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-white/10 bg-white/5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/50">Total</div>
          <div className="mt-2 text-3xl font-semibold text-white">{notifications.length}</div>
          <div className="mt-1 text-sm text-white/60">Notificacoes carregadas</div>
        </Card>

        <Card className="border-amber-400/20 bg-amber-400/5">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Nao lidas</div>
          <div className="mt-2 text-3xl font-semibold text-amber-100">{unreadCount}</div>
          <div className="mt-1 text-sm text-white/60">Itens que ainda pedem atencao</div>
        </Card>

        <Card className="border-emerald-400/20 bg-emerald-500/5">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Lidas</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-100">{readCount}</div>
          <div className="mt-1 text-sm text-white/60">Ja processadas pela equipe</div>
        </Card>
      </div>

      {queryError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">{queryError}</div>
      ) : null}
      {mutationError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">{mutationError}</div>
      ) : null}

      <div className="grid gap-3">
        {isLoading ? (
          <Card>
            <div className="text-sm text-white/70">Carregando notificacoes...</div>
          </Card>
        ) : null}

        {!isLoading && notifications.length === 0 ? (
          <Card className="border-white/10 bg-white/5">
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Bell className="h-6 w-6 text-white/30" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Nenhuma notificacao por aqui</div>
                <div className="mt-1 text-sm text-white/60">Quando novas mensagens chegarem, elas aparecerao nesta central.</div>
              </div>
            </div>
          </Card>
        ) : null}

        {!isLoading
          ? notifications.map((notification) => {
              const typeMeta = getNotificationTypeMeta(notification.type);

              return (
                <article
                  key={notification.id}
                  className={cn(
                    'rounded-2xl border p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all',
                    notification.is_read
                      ? 'border-white/10 bg-neutral-950/45'
                      : 'border-amber-400/20 bg-gradient-to-br from-amber-400/10 via-white/5 to-transparent',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', typeMeta.className)}>
                          {typeMeta.label}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                            notification.is_read
                              ? 'border-white/10 bg-white/5 text-white/50'
                              : 'border-amber-400/30 bg-amber-400/10 text-amber-100',
                          )}
                        >
                          {notification.is_read ? 'Lida' : 'Nova'}
                        </span>
                      </div>

                      <h2 className="mt-3 text-lg font-semibold text-white">{notification.title}</h2>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/70">{notification.message}</p>
                    </div>

                    <div className="text-right text-xs text-white/45">
                      <div>{formatNotificationRelativeTime(notification.created_at)}</div>
                      <div className="mt-1">{formatNotificationDateTime(notification.created_at)}</div>
                    </div>
                  </div>
                </article>
              );
            })
          : null}
      </div>
    </div>
  );
}
