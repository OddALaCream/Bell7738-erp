import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { QueryErrorState } from '@/components/common/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-types';
import { isPastInstant } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import type { ProjectMember } from '@/types/domain';
import { formatMeetingWhen } from './format';
import { useDeleteMeeting, useMeeting } from './hooks';
import { MeetingFormDialog } from './meeting-form-dialog';
import { MeetingNotesSection } from './meeting-notes-section';

/**
 * The single meeting detail (docs/UI-UX.md: "Tareas y reuniones abren el mismo
 * detalle desde sus diferentes vistas"): driven by `?meetingId=` so the list
 * and the project calendar open exactly this.
 */
export function MeetingDetailSheet({ projectId, members }: { projectId: string; members: ProjectMember[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const meetingId = searchParams.get('meetingId') ?? undefined;
  const meetingQuery = useMeeting(projectId, meetingId);
  const deleteMeeting = useDeleteMeeting(projectId);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const meeting = meetingQuery.data;

  function close() {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('meetingId');
        return next;
      },
      { replace: true },
    );
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    if (notesDirty) setConfirmingClose(true);
    else close();
  }

  return (
    <>
      <Sheet open={!!meetingId} onOpenChange={handleOpenChange}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{meeting?.title ?? 'Reunión'}</SheetTitle>
            <SheetDescription className={meeting ? undefined : 'sr-only'}>
              {meeting ? formatMeetingWhen(meeting) : 'Detalle de la reunión'}
            </SheetDescription>
          </SheetHeader>

          {meetingQuery.isPending && meetingId && (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {meetingQuery.isError && <QueryErrorState error={meetingQuery.error} onRetry={() => meetingQuery.refetch()} />}

          {meeting && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {isPastInstant(meeting.endsAt) && <Badge variant="outline">Finalizada</Badge>}
                {meeting.viewerCapabilities.canEditStructure && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil /> Editar
                  </Button>
                )}
                {meeting.viewerCapabilities.canDelete && (
                  <Button size="sm" variant="outline" onClick={() => setDeleting(true)}>
                    <Trash2 className="text-destructive" /> Eliminar
                  </Button>
                )}
              </div>

              {meeting.description && (
                <section aria-labelledby="meeting-agenda-heading" className="space-y-1">
                  <h3 id="meeting-agenda-heading" className="text-xs font-semibold uppercase text-muted-foreground">
                    Agenda
                  </h3>
                  <p className="whitespace-pre-wrap text-sm">{meeting.description}</p>
                </section>
              )}

              <section aria-labelledby="meeting-participants-heading" className="space-y-2">
                <h3 id="meeting-participants-heading" className="text-xs font-semibold uppercase text-muted-foreground">
                  Participantes ({meeting.participants.length})
                </h3>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {meeting.participants.map((participant) => (
                    <li key={participant.userId} className="flex items-center gap-1.5 text-sm">
                      <UserAvatar
                        firstName={participant.user.firstName}
                        lastName={participant.user.lastName}
                        className="size-6"
                      />
                      <span>{fullName(participant.user)}</span>
                      {participant.userId === meeting.organizerId && (
                        <Badge variant="secondary">
                          <Crown /> Organizador
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <MeetingNotesSection projectId={projectId} meeting={meeting} onDirtyChange={setNotesDirty} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {meeting && (
        <MeetingFormDialog open={editing} onOpenChange={setEditing} projectId={projectId} members={members} meeting={meeting} />
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar reunión"
        description={
          <>
            Se dará de baja la reunión <strong>{meeting?.title}</strong>. Dejará de aparecer en calendarios y en Mi cronograma;
            las notas se conservan en el historial.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!meeting) return;
          try {
            await deleteMeeting.mutateAsync(meeting.id);
            close();
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'No se pudo eliminar la reunión.');
          }
        }}
      />

      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title="Hay notas sin guardar"
        description="Si cierras el detalle ahora, se perderán los cambios que no guardaste en las notas."
        confirmLabel="Cerrar y descartar"
        variant="destructive"
        onConfirm={() => {
          setNotesDirty(false);
          close();
        }}
      />
    </>
  );
}
