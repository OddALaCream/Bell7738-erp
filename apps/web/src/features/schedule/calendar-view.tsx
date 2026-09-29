import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import { CheckCircle2, ListTodo, Users } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { addDays, localDateOnly } from '@/lib/dates';
import type { CalendarItem } from '@/types/domain';
import { toFullCalendarEvent, type CalendarEventProps } from './to-fc-events';

export interface VisibleRange {
  from: string;
  to: string;
  /** First day of the primary period (month/week) being shown, to restore the position later. */
  anchor: string;
}

export type SelectedCalendarItem = Pick<CalendarItem, 'kind' | 'id' | 'projectId'>;

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
      <li className="flex items-center gap-1.5">
        <ListTodo className="size-3.5 text-brand-600" aria-hidden="true" /> Tarea
      </li>
      <li className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5" aria-hidden="true" /> Tarea terminada
      </li>
      <li className="flex items-center gap-1.5">
        <Users className="size-3.5" aria-hidden="true" /> Reunión
      </li>
    </ul>
  );
}

/** Icon + accessible text next to the title so type/state never rely on color alone. */
function renderEventContent(arg: EventContentArg) {
  const { kind, status } = arg.event.extendedProps as CalendarEventProps;
  const done = kind === 'task' && status === 'DONE';
  const Icon = kind === 'meeting' ? Users : done ? CheckCircle2 : ListTodo;
  const label = kind === 'meeting' ? 'Reunión' : done ? 'Tarea terminada' : 'Tarea';
  return (
    <span className="fc-erp-event-content">
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      {kind === 'meeting' && arg.timeText && <b className="fc-erp-event-time">{arg.timeText}</b>}
      <span className="fc-event-title">{arg.event.title}</span>
    </span>
  );
}

/** FullCalendar reports an exclusive `end`; the API range is inclusive and date-only. */
function toVisibleRange(arg: DatesSetArg): VisibleRange {
  return {
    from: localDateOnly(arg.start),
    to: addDays(localDateOnly(arg.end), -1),
    anchor: localDateOnly(arg.view.currentStart),
  };
}

/**
 * Stays mounted while data loads: unmounting it would reset the visible
 * month back to today every time the user navigates.
 */
function hideDecorativeIcons(arg: { el: HTMLElement }) {
  const root = arg.el.closest('.fc') ?? document;
  root.querySelectorAll('.fc-icon').forEach((icon) => {
    icon.removeAttribute('role');
    icon.setAttribute('aria-hidden', 'true');
  });
}

export function CalendarView({
  items,
  loading = false,
  initialDate,
  onSelectItem,
  onRangeChange,
}: {
  items: CalendarItem[];
  loading?: boolean;
  /** Read once on mount (FullCalendar treats it as initial-only). */
  initialDate?: string;
  onSelectItem: (item: SelectedCalendarItem) => void;
  onRangeChange: (range: VisibleRange) => void;
}) {
  // docs/UI-UX.md: on narrow screens the month grid is too dense; open on the agenda list instead.
  const compact = useMediaQuery('(max-width: 639px)');
  const events = useMemo(() => items.map(toFullCalendarEvent), [items]);

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    const { kind, id, projectId } = info.event.extendedProps as CalendarEventProps;
    onSelectItem({ kind, id, projectId });
  }

  return (
    <div className="fc-erp space-y-3" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CalendarLegend />
        <p role="status" className="text-xs text-muted-foreground">
          {loading ? 'Cargando…' : ''}
        </p>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={esLocale}
        initialView={compact ? 'listMonth' : 'dayGridMonth'}
        initialDate={initialDate}
        headerToolbar={
          compact
            ? { start: 'title', end: 'prev,next' }
            : { start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek,listMonth' }
        }
        footerToolbar={compact ? { start: 'today', end: 'listMonth,dayGridMonth' } : false}
        buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' }}
        height="auto"
        firstDay={1}
        dayMaxEvents={3}
        eventInteractive
        nowIndicator
        events={events}
        eventContent={renderEventContent}
        eventClick={handleEventClick}
        datesSet={(arg) => onRangeChange(toVisibleRange(arg))}
        // FullCalendar marks its toolbar chevrons role=img with no name and gives "+n más" links
        // an empty aria-controls; tidy both so assistive tech isn't handed broken semantics.
        viewDidMount={hideDecorativeIcons}
        moreLinkDidMount={(arg) => {
          arg.el.removeAttribute('aria-controls');
          arg.el.removeAttribute('aria-expanded');
        }}
        noEventsContent="No hay tareas ni reuniones en este periodo."
      />
    </div>
  );
}
