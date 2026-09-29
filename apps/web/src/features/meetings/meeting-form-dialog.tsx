import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-types';
import { instantToLocalInput, localInputToInstant, localTimeZoneLabel } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import type { MeetingDetail, MeetingParticipant, ProjectMember } from '@/types/domain';
import type { UpdateMeetingPayload } from './api';
import { useCreateMeeting, useSetMeetingParticipants, useUpdateMeeting } from './hooks';

const schema = z
  .object({
    title: z.string().trim().min(1, 'Ingresa un título.').max(200, 'Máximo 200 caracteres.'),
    description: z.string().max(4000, 'Máximo 4000 caracteres.').optional(),
    startsAt: z.string().min(1, 'Selecciona el inicio.'),
    endsAt: z.string().min(1, 'Selecciona el fin.'),
    participantIds: z.array(z.string()),
  })
  // `datetime-local` values are zero-padded `YYYY-MM-DDTHH:mm`, so string order is time order.
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'El fin debe ser posterior al inicio.',
    path: ['endsAt'],
  });

type FormValues = z.infer<typeof schema>;

interface Candidate {
  userId: string;
  firstName: string;
  lastName: string;
  /** Still a participant but no longer a project member: the API rejects keeping them. */
  formerMember?: boolean;
}

function defaultTimes(): { startsAt: string; endsAt: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: instantToLocalInput(start.toISOString()), endsAt: instantToLocalInput(end.toISOString()) };
}

function buildCandidates(
  members: ProjectMember[],
  organizerId: string,
  existing: MeetingParticipant[],
): Candidate[] {
  const memberIds = new Set(members.map((member) => member.userId));
  const fromMembers: Candidate[] = members
    .filter((member) => member.userId !== organizerId)
    .map((member) => ({ userId: member.userId, firstName: member.user.firstName, lastName: member.user.lastName }));
  const formerMembers: Candidate[] = existing
    .filter((participant) => participant.userId !== organizerId && !memberIds.has(participant.userId))
    .map((participant) => ({
      userId: participant.userId,
      firstName: participant.user.firstName,
      lastName: participant.user.lastName,
      formerMember: true,
    }));
  return [...fromMembers, ...formerMembers];
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  projectId,
  members,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: ProjectMember[];
  /** When present the dialog edits this meeting; otherwise it creates one. */
  meeting?: MeetingDetail;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <MeetingForm projectId={projectId} members={members} meeting={meeting} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function MeetingForm({
  projectId,
  members,
  meeting,
  onOpenChange,
}: {
  projectId: string;
  members: ProjectMember[];
  meeting?: MeetingDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const createMeeting = useCreateMeeting(projectId);
  const updateMeeting = useUpdateMeeting(projectId, meeting?.id ?? '');
  const setParticipants = useSetMeetingParticipants(projectId, meeting?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const organizerId = meeting?.organizerId ?? user?.id ?? '';
  const organizer = meeting?.participants.find((participant) => participant.userId === organizerId)?.user ?? user ?? null;
  const candidates = buildCandidates(members, organizerId, meeting?.participants ?? []);

  // Frozen at open: a background refetch of the meeting must not change what "unchanged" means on submit.
  const [initial] = useState(() =>
    meeting
      ? { startsAt: instantToLocalInput(meeting.startsAt), endsAt: instantToLocalInput(meeting.endsAt) }
      : defaultTimes(),
  );
  const [initialParticipantIds] = useState<string[]>(() =>
    meeting ? meeting.participants.map((participant) => participant.userId).filter((id) => id !== organizerId) : [],
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: meeting?.title ?? '',
      description: meeting?.description ?? '',
      startsAt: initial.startsAt,
      endsAt: initial.endsAt,
      participantIds: initialParticipantIds,
    },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (!meeting) {
        await createMeeting.mutateAsync({
          title: values.title,
          description: values.description?.trim() ? values.description : undefined,
          startsAt: localInputToInstant(values.startsAt),
          endsAt: localInputToInstant(values.endsAt),
          participantIds: values.participantIds,
        });
        onOpenChange(false);
        return;
      }

      const payload: UpdateMeetingPayload = {};
      if (values.title !== meeting.title) payload.title = values.title;
      const description = values.description?.trim() ? values.description : null;
      if (description !== (meeting.description ?? null)) payload.description = description;
      // Compare against the original local values (minute precision), so an untouched time is never re-sent.
      if (values.startsAt !== initial.startsAt) payload.startsAt = localInputToInstant(values.startsAt);
      if (values.endsAt !== initial.endsAt) payload.endsAt = localInputToInstant(values.endsAt);

      const before = new Set(initialParticipantIds);
      const participantsChanged =
        before.size !== values.participantIds.length || values.participantIds.some((id) => !before.has(id));

      const structureChanged = Object.keys(payload).length > 0;
      if (structureChanged) await updateMeeting.mutateAsync(payload);
      if (participantsChanged) {
        try {
          await setParticipants.mutateAsync(values.participantIds);
        } catch (error) {
          setFormError(
            `${structureChanged ? 'Los datos de la reunión se guardaron, pero ' : ''}no se pudieron actualizar los participantes: ${
              error instanceof ApiError ? error.message : 'error inesperado'
            }`,
          );
          return;
        }
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) setFormError(error.message);
      else if (error instanceof ApiError && error.status === 403) setFormError('No tienes permiso para esta acción.');
      else if (error instanceof ApiError && error.status === 404) setFormError('La reunión ya no existe.');
      else setFormError('No se pudo guardar la reunión.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{meeting ? 'Editar reunión' : 'Crear reunión'}</DialogTitle>
        <DialogDescription>
          {meeting
            ? 'Si cambias el título o el horario, se notificará a los participantes.'
            : 'Los participantes que añadas recibirán una notificación.'}{' '}
          Sólo miembros activos del proyecto pueden participar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="meeting-title">Título</Label>
        <Input id="meeting-title" {...register('title')} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'meeting-title-error' : undefined} />
        {errors.title && (
          <p id="meeting-title-error" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meeting-description">Agenda (opcional)</Label>
        <Textarea id="meeting-description" rows={3} {...register('description')} />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-start">Inicio</Label>
          <Input id="meeting-start" type="datetime-local" {...register('startsAt')} aria-invalid={!!errors.startsAt} />
          {errors.startsAt && <p className="text-sm text-destructive">{errors.startsAt.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-end">Fin</Label>
          <Input
            id="meeting-end"
            type="datetime-local"
            {...register('endsAt')}
            aria-invalid={!!errors.endsAt}
            aria-describedby={errors.endsAt ? 'meeting-end-error' : undefined}
          />
          {errors.endsAt && (
            <p id="meeting-end-error" className="text-sm text-destructive">
              {errors.endsAt.message}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">Horas en tu zona horaria ({localTimeZoneLabel()}).</p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Participantes</legend>
        <Controller
          control={control}
          name="participantIds"
          render={({ field }) => (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {organizer && (
                <label className="flex items-center gap-2 rounded-md p-1 text-sm text-muted-foreground">
                  <Checkbox checked disabled />
                  <UserAvatar firstName={organizer.firstName} lastName={organizer.lastName} className="size-6" />
                  {fullName(organizer)} · organizador
                </label>
              )}
              {candidates.length === 0 && (
                <p className="p-1 text-sm text-muted-foreground">No hay otros miembros en el proyecto.</p>
              )}
              {candidates.map((candidate) => {
                const checked = field.value.includes(candidate.userId);
                return (
                  <label key={candidate.userId} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        if (value === true) field.onChange([...field.value, candidate.userId]);
                        else field.onChange(field.value.filter((id) => id !== candidate.userId));
                      }}
                    />
                    <UserAvatar firstName={candidate.firstName} lastName={candidate.lastName} className="size-6" />
                    <span>
                      {fullName(candidate)}
                      {candidate.formerMember && (
                        <span className="block text-xs text-destructive">Ya no es miembro del proyecto: desmárcalo para guardar.</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        />
      </fieldset>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {meeting ? 'Guardar cambios' : 'Crear reunión'}
        </Button>
      </DialogFooter>
    </form>
  );
}
