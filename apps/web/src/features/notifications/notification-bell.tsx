import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectNames } from '@/features/projects/hooks';
import { notificationHref } from './api';
import { NotificationItem } from './notification-item';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from './hooks';
import type { Notification } from '@/types/domain';

const RECENT_COUNT = 8;
const OPEN_REFRESH_MS = 30_000;

/** docs/UI-UX.md "Notificaciones": unread counter + popover with the latest, click marks read and navigates. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const recent = useNotifications({ pageSize: RECENT_COUNT }, { refetchInterval: open ? OPEN_REFRESH_MS : false });
  const projectNames = useProjectNames(open);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // The list may be up to a poll interval behind the counter; show current data on open.
    if (next) recent.refetch();
  }

  function handleSelect(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    setOpen(false);
    // Deleted or no-longer-visible resources land on the destination's safe not-found state.
    navigate(notificationHref(notification) ?? '/notifications');
  }

  const count = unread.data ?? 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificaciones${count > 0 ? `, ${count} sin leer` : ''}`}
        >
          <Bell />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground"
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-semibold">Notificaciones</p>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="h-7 px-2 text-xs"
            >
              <CheckCheck className="size-3.5" /> Marcar todas como leídas
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {recent.isPending ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recent.isError ? (
            <div role="alert" className="space-y-2 p-4 text-center text-sm">
              <p>No se pudieron cargar las notificaciones.</p>
              <Button variant="outline" size="sm" onClick={() => recent.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : recent.data && recent.data.data.length > 0 ? (
            <ul>
              {recent.data.data.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem
                    notification={notification}
                    projectName={notification.projectId ? projectNames.get(notification.projectId) : undefined}
                    onSelect={handleSelect}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="Sin notificaciones" className="border-none py-8" />
          )}
        </div>
        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            Ver historial completo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
