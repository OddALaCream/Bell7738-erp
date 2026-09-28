import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CalendarClock, Plus } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { QueryState } from '@/components/common/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn, fullName } from '@/lib/utils';
import { useProjectMembers } from '@/features/projects/hooks';
import { useMeetings } from '@/features/meetings/hooks';
import { formatMeetingWhen, meetingPhase, MEETING_PHASE_LABEL } from '@/features/meetings/format';
import { MeetingDetailSheet } from '@/features/meetings/meeting-detail-sheet';
import { MeetingFormDialog } from '@/features/meetings/meeting-form-dialog';
import type { ProjectDetail } from '@/types/domain';

type MeetingView = 'upcoming' | 'past' | 'all';

const VIEW_OPTIONS: Array<{ value: MeetingView; label: string }> = [
  { value: 'upcoming', label: 'Próximas' },
  { value: 'past', label: 'Pasadas' },
  { value: 'all', label: 'Todas' },
];
const PAGE_SIZE = 25;
const MAX_VISIBLE_AVATARS = 4;

function parseView(value: string | null): MeetingView {
  return value === 'past' || value === 'all' ? value : 'upcoming';
}

export function ProjectMeetingsPage() {
  const project = useOutletContext<ProjectDetail>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);

  const view = parseView(searchParams.get('view'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const membersQuery = useProjectMembers(project.id);
  const meetingsQuery = useMeetings(project.id, {
    view: view === 'all' ? undefined : view,
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: 'startsAt',
    // Soonest first for what's ahead, most recent first for history.
    order: view === 'past' ? 'desc' : 'asc',
  });

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

  function openMeeting(meetingId: string) {
    updateParams({ meetingId });
  }

  const filtered = !!debouncedSearch || view !== 'upcoming';
  // A VIEWER can never create; a null role is an org-wide override the API decides on.
  const canCreate = project.viewerCapabilities.role !== 'VIEWER';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Filtrar reuniones">
            {VIEW_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={view === option.value ? 'secondary' : 'ghost'}
                aria-pressed={view === option.value}
                onClick={() => updateParams({ view: option.value === 'upcoming' ? undefined : option.value, page: undefined })}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Input
            aria-label="Buscar reuniones"
            placeholder="Buscar reuniones…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              updateParams({ search: event.target.value || undefined, page: undefined });
            }}
            className="w-56"
          />
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Crear reunión
          </Button>
        )}
      </div>

      <QueryState
        query={meetingsQuery}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={CalendarClock}
            title={filtered ? 'Sin reuniones para estos filtros' : 'No hay reuniones próximas'}
            description={
              filtered
                ? 'Prueba con otra búsqueda o revisa las reuniones pasadas.'
                : canCreate
                  ? 'Crea una reunión para coordinar al equipo y guardar sus notas.'
                  : 'Cuando se programe una reunión de este proyecto aparecerá aquí.'
            }
          />
        }
      >
        {(data) => (
          <div className={cn('space-y-3', meetingsQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <ul className="space-y-2">
              {data.data.map((meeting) => {
                const phase = meetingPhase(meeting);
                const organizer = meeting.participants.find((participant) => participant.userId === meeting.organizerId)?.user;
                return (
                  <li key={meeting.id}>
                    <button
                      type="button"
                      onClick={() => openMeeting(meeting.id)}
                      className={cn(
                        'flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border p-3 text-left hover:bg-accent',
                        phase === 'past' && 'opacity-70',
                      )}
                    >
                      <span className="min-w-0 flex-1 basis-56 space-y-0.5">
                        <span className="block truncate text-sm font-medium">{meeting.title}</span>
                        <span className="block text-xs text-muted-foreground">{formatMeetingWhen(meeting)}</span>
                        {organizer && (
                          <span className="block text-xs text-muted-foreground">Organiza {fullName(organizer)}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="flex -space-x-1.5">
                          {meeting.participants.slice(0, MAX_VISIBLE_AVATARS).map((participant) => (
                            <UserAvatar
                              key={participant.userId}
                              firstName={participant.user.firstName}
                              lastName={participant.user.lastName}
                              className="size-6 border border-background"
                            />
                          ))}
                        </span>
                        {meeting.participants.length > MAX_VISIBLE_AVATARS && (
                          <span className="text-xs text-muted-foreground">
                            +{meeting.participants.length - MAX_VISIBLE_AVATARS}
                          </span>
                        )}
                        <Badge variant={phase === 'live' ? 'success' : 'outline'}>{MEETING_PHASE_LABEL[phase]}</Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
            />          </div>
        )}
      </QueryState>

      <MeetingFormDialog open={createOpen} onOpenChange={setCreateOpen} projectId={project.id} members={membersQuery.data ?? []} />
      <MeetingDetailSheet projectId={project.id} members={membersQuery.data ?? []} />
    </div>
  );
}
