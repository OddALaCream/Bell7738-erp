import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useProjectNames } from '@/features/projects/hooks';
import { notificationHref } from '@/features/notifications/api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifications/hooks';
import { NotificationItem } from '@/features/notifications/notification-item';
import type { Notification, NotificationType } from '@/types/domain';

type ReadFilter = 'all' | 'unread' | 'read';

const READ_OPTIONS: Array<{ value: ReadFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'No leídas' },
  { value: 'read', label: 'Leídas' },
];

const TYPE_OPTIONS: Array<{ value: NotificationType; label: string }> = [
  { value: 'TASK_ASSIGNED', label: 'Tarea asignada' },
  { value: 'MEETING_ADDED', label: 'Añadido a una reunión' },
  { value: 'MEETING_UPDATED', label: 'Reunión modificada' },
  { value: 'MEETING_REMINDER_24H', label: 'Recordatorio 24 h' },
  { value: 'MEETING_REMINDER_1H', label: 'Recordatorio 1 h' },
];

const PAGE_SIZE = 25;

function parseReadFilter(value: string | null): ReadFilter {
  return value === 'unread' || value === 'read' ? value : 'all';
}

function parseType(value: string | null): NotificationType | undefined {
  return TYPE_OPTIONS.find((option) => option.value === value)?.value;
}

/** docs/UI-UX.md: "Página completa para historial y filtros"; filters live in the URL. */
export function NotificationsPage() {
  useSetBreadcrumb('Notificaciones');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const readFilter = parseReadFilter(searchParams.get('read'));
  const type = parseType(searchParams.get('type'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const notificationsQuery = useNotifications({
    read: readFilter === 'all' ? undefined : readFilter === 'read',
    type,
    page,
    pageSize: PAGE_SIZE,
  });
  const unread = useUnreadCount();
  const projectNames = useProjectNames();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function updateParams(changes: Record<string, string | undefined>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function handleSelect(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    const href = notificationHref(notification);
    if (href) navigate(href);
  }

  const unreadCount = unread.data ?? 0;
  const filtered = readFilter !== 'all' || !!type;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `Tienes ${unreadCount} sin leer.` : 'Estás al día.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadCount === 0}
          loading={markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          <CheckCheck /> Marcar todas como leídas
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1" role="group" aria-label="Estado de lectura">
          {READ_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={readFilter === option.value ? 'secondary' : 'ghost'}
              aria-pressed={readFilter === option.value}
              onClick={() => updateParams({ read: option.value === 'all' ? undefined : option.value, page: undefined })}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="notification-type">Tipo</Label>
          <Select value={type ?? 'ALL'} onValueChange={(value) => updateParams({ type: value === 'ALL' ? undefined : value, page: undefined })}>
            <SelectTrigger id="notification-type" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QueryState
        query={notificationsQuery}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={Bell}
            title={filtered ? 'Sin notificaciones para estos filtros' : 'Aún no tienes notificaciones'}
            description={
              filtered
                ? 'Prueba con otro filtro.'
                : 'Te avisaremos cuando te asignen una tarea o te añadan a una reunión.'
            }
          />
        }
      >
        {(data) => (
          <div className={cn('space-y-3', notificationsQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {data.data.map((notification) => (
                <li key={notification.id} className="flex items-stretch">
                  <NotificationItem
                    notification={notification}
                    projectName={notification.projectId ? projectNames.get(notification.projectId) : undefined}
                    onSelect={handleSelect}
                    className="flex-1"
                  />
                  {!notification.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto self-center rounded-none px-3 text-xs"
                      aria-label="Marcar esta notificación como leída"
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      Marcar leída
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
