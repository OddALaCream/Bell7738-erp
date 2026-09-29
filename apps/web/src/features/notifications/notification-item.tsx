import { AlarmClock, Bell, CalendarClock, CalendarPlus, ListTodo, type LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types/domain';
import { notificationTitle } from './api';

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  TASK_ASSIGNED: ListTodo,
  MEETING_ADDED: CalendarPlus,
  MEETING_UPDATED: CalendarClock,
  MEETING_REMINDER_24H: AlarmClock,
  MEETING_REMINDER_1H: AlarmClock,
};

/**
 * One notification row (docs/UI-UX.md: "tipo, texto, tiempo y proyecto cuando
 * aplique"), shared by the bell popover and the history page. Unread is shown
 * by weight, a dot *and* text for screen readers — never color alone.
 */
export function NotificationItem({
  notification,
  projectName,
  onSelect,
  className,
}: {
  notification: Notification;
  projectName?: string;
  onSelect: (notification: Notification) => void;
  className?: string;
}) {
  const unread = !notification.readAt;
  const Icon = TYPE_ICON[notification.type] ?? Bell;
  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent', className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', unread ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className={cn('block', unread ? 'font-medium' : 'text-muted-foreground')}>
          {unread && <span className="sr-only">No leída: </span>}
          {notificationTitle(notification)}
        </span>
        <span className="block text-xs text-muted-foreground">
          {projectName && <>{projectName} · </>}
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: es })}
        </span>
      </span>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
    </button>
  );
}
