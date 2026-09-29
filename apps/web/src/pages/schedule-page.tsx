import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarDays, LayoutList } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { EmptyState } from '@/components/common/empty-state';
import { QueryErrorState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, localTimeZoneLabel, todayDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useProjects } from '@/features/projects/hooks';
import type { MyScheduleParams } from '@/features/schedule/api';
import { useMySchedule, type DateRange } from '@/features/schedule/hooks';
import { CalendarView, type SelectedCalendarItem, type VisibleRange } from '@/features/schedule/calendar-view';
import { ScheduleList } from '@/features/schedule/schedule-list';
import type { TaskStatus } from '@/types/domain';

type Kind = NonNullable<MyScheduleParams['kind']>;

const KIND_OPTIONS: Array<{ value: Kind; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'task', label: 'Tareas' },
  { value: 'meeting', label: 'Reuniones' },
];

const STATUS_VALUES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE'];
const LIST_LOOKBACK_DAYS = 7;

function parseKind(value: string | null): Kind {
  return value === 'task' || value === 'meeting' ? value : 'all';
}

function parseStatus(value: string | null): TaskStatus | undefined {
  return STATUS_VALUES.find((status) => status === value);
}

export function SchedulePage() {
  useSetBreadcrumb('Mi cronograma');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // All filters live in the URL (docs/UI-UX.md) so back/forward and shared links keep them.
  const kind = parseKind(searchParams.get('kind'));
  const projectId = searchParams.get('projectId') ?? undefined;
  const status = kind === 'meeting' ? undefined : parseStatus(searchParams.get('status'));
  const view = searchParams.get('view') === 'calendar' ? 'calendar' : 'list';
  const fromParam = searchParams.get('from') ?? undefined;
  const toParam = searchParams.get('to') ?? undefined;

  // The list defaults to "the last week and everything ahead" so old history doesn't bury what's next.
  const listFrom = fromParam ?? addDays(todayDateOnly(), -LIST_LOOKBACK_DAYS);

  // The calendar drives its own range; remember where it was so "back" from a detail restores it.
  const [calendarRange, setCalendarRange] = useState<DateRange | null>(null);
  const [initialDate] = useState(() => searchParams.get('date') ?? undefined);

  const projectsQuery = useProjects({ pageSize: 100 });
  const projectNames = useMemo(
    () => new Map((projectsQuery.data?.data ?? []).map((project) => [project.id, project.name] as const)),
    [projectsQuery.data],
  );

  const scheduleParams: MyScheduleParams | null =
    view === 'calendar'
      ? calendarRange && { kind, projectId, status, ...calendarRange }
      : { kind, projectId, status, from: listFrom, to: toParam };
  const scheduleQuery = useMySchedule(scheduleParams ?? {}, scheduleParams !== null);

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

  function handleRangeChange({ from, to, anchor }: VisibleRange) {
    setCalendarRange((current) => (current && current.from === from && current.to === to ? current : { from, to }));
    updateParams({ date: anchor });
  }

  function openItem(item: SelectedCalendarItem) {
    // Same detail as everywhere else: the project's own task/meeting surface. History keeps these filters.
    const target = item.kind === 'task' ? `tasks?taskId=${item.id}` : `meetings?meetingId=${item.id}`;
    navigate(`/projects/${item.projectId}/${target}`);
  }

  const hasFilters = kind !== 'all' || !!projectId || !!status || !!fromParam || !!toParam;
  const items = scheduleQuery.data ?? [];
  const ready = scheduleParams !== null && !scheduleQuery.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">Mi cronograma</h1>
        <p className="text-sm text-muted-foreground">
          Tus tareas asignadas y las reuniones en las que participas. Horas en tu zona horaria ({localTimeZoneLabel()}).
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1" role="group" aria-label="Tipo de elemento">
            {KIND_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={kind === option.value ? 'secondary' : 'ghost'}
                aria-pressed={kind === option.value}
                onClick={() => updateParams({ kind: option.value === 'all' ? undefined : option.value })}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Tipo de vista">
            <Button
              size="sm"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'list'}
              onClick={() => updateParams({ view: undefined })}
            >
              <LayoutList /> Lista
            </Button>
            <Button
              size="sm"
              variant={view === 'calendar' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'calendar'}
              onClick={() => updateParams({ view: 'calendar' })}
            >
              <CalendarDays /> Calendario
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="schedule-project">Proyecto</Label>
            <Select value={projectId ?? 'ALL'} onValueChange={(value) => updateParams({ projectId: value === 'ALL' ? undefined : value })}>
              <SelectTrigger id="schedule-project" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los proyectos</SelectItem>
                {(projectsQuery.data?.data ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind !== 'meeting' && (
            <div className="space-y-1">
              <Label htmlFor="schedule-status">Estado de la tarea</Label>
              <Select value={status ?? 'ALL'} onValueChange={(value) => updateParams({ status: value === 'ALL' ? undefined : value })}>
                <SelectTrigger id="schedule-status" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los estados</SelectItem>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                  <SelectItem value="IN_PROGRESS">En progreso</SelectItem>
                  <SelectItem value="DONE">Terminada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {view === 'list' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="schedule-from">Desde</Label>
                <Input
                  id="schedule-from"
                  type="date"
                  className="w-40"
                  value={listFrom}
                  max={toParam}
                  onChange={(event) => updateParams({ from: event.target.value || undefined })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="schedule-to">Hasta</Label>
                <Input
                  id="schedule-to"
                  type="date"
                  className="w-40"
                  value={toParam ?? ''}
                  min={listFrom}
                  onChange={(event) => updateParams({ to: event.target.value || undefined })}
                />
              </div>
            </>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateParams({ kind: undefined, projectId: undefined, status: undefined, from: undefined, to: undefined })
              }
            >
              Restablecer filtros
            </Button>
          )}
        </div>
      </div>

      {scheduleQuery.isError && <QueryErrorState error={scheduleQuery.error} onRetry={() => scheduleQuery.refetch()} />}

      {view === 'calendar' ? (
        <CalendarView
          items={items}
          loading={scheduleQuery.isFetching}
          initialDate={initialDate}
          onSelectItem={openItem}
          onRangeChange={handleRangeChange}
        />
      ) : (
        !scheduleQuery.isError && (
          <div aria-busy={scheduleQuery.isFetching} className={cn(scheduleQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            {!ready ? (
              <Skeleton className="h-64 w-full" />
            ) : items.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={hasFilters ? 'Sin resultados para estos filtros' : 'No tienes nada programado'}
                description={
                  hasFilters
                    ? 'Prueba con otro rango de fechas, proyecto o estado.'
                    : 'Aquí aparecerán tus tareas asignadas y las reuniones en las que participas.'
                }
              />
            ) : (
              <ScheduleList items={items} projectNames={projectNames} windowStart={listFrom} onSelectItem={openItem} />
            )}
          </div>
        )
      )}
    </div>
  );
}
