import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { notificationHref, notificationTitle } from './api';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from './hooks';
import type { Notification } from '@/types/domain';

export function NotificationBell() {
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const recent = useNotifications({ pageSize: 8 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function handleSelect(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    const href = notificationHref(notification);
    navigate(href ?? '/notifications');
  }

  const count = unread.data ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificaciones${count > 0 ? `, ${count} sin leer` : ''}`}
        >
          <Bell />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-semibold">Notificaciones</p>
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} className="h-7 px-2 text-xs">
              <CheckCheck className="size-3.5" /> Marcar todas
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
          ) : recent.data && recent.data.data.length > 0 ? (
            <ul>
              {recent.data.data.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(notification)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      {!notification.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
                      <span className={notification.readAt ? 'text-muted-foreground' : 'font-medium'}>
                        {notificationTitle(notification)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: es })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="Sin notificaciones" className="border-none py-8" />
          )}
        </div>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/notifications')}>
            Ver historial completo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
