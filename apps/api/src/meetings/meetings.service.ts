import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import { toDateOrUndefined } from '../common/dates.js';
import { MeetingNotesRevisionConflictException } from './meeting.exceptions.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import type { ListMeetingsDto } from './dto/list-meetings.dto.js';
import type { SetMeetingParticipantsDto } from './dto/set-meeting-participants.dto.js';
import type { UpdateMeetingNotesDto } from './dto/update-meeting-notes.dto.js';
import type { Prisma, ProjectMemberRole } from '../generated/prisma/client.js';

const MEETING_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  organizerId: true,
  notes: true,
  revision: true,
  notesUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: {
      userId: true,
      addedAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarStorageKey: true,
        },
      },
    },
  },
} as const;

type MeetingWithParticipants = Prisma.MeetingGetPayload<{
  select: typeof MEETING_SELECT;
}>;

export interface MeetingViewerCapabilities {
  role: ProjectMemberRole | null;
  isOrganizer: boolean;
  isParticipant: boolean;
  canEditStructure: boolean;
  canEditNotes: boolean;
  canDelete: boolean;
}

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  async list(
    projectId: string,
    query: ListMeetingsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    await this.access.assertCanViewProject(actor, projectId);

    const now = new Date();
    const where: Prisma.MeetingWhereInput = {
      projectId,
      deletedAt: null,
      // Re-asserted here (not just via assertCanViewProject above) so a
      // project soft-deleted in the gap between that check and this query
      // can't still surface its meetings.
      project: { deletedAt: null },
      ...(query.view === 'upcoming'
        ? { startsAt: { gte: now } }
        : query.view === 'past'
          ? { startsAt: { lt: now } }
          : {}),
      ...(query.participantId
        ? { participants: { some: { userId: query.participantId } } }
        : {}),
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        select: MEETING_SELECT,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  async getById(
    projectId: string,
    meetingId: string,
    actor: AuthenticatedUser,
  ) {
    const meeting = await this.getMeetingOrThrow(projectId, meetingId, actor);
    const viewerCapabilities = await this.getViewerCapabilities(
      actor,
      meeting,
      projectId,
    );
    return { ...meeting, viewerCapabilities };
  }

  /** docs/RBAC.md "Crear: MEETINGS_CREATE y rol MEMBER o MANAGER, o override." */
  async create(
    projectId: string,
    dto: CreateMeetingDto,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.hasMemberLevelAccess(
        actor,
        projectId,
        'MEETINGS_CREATE',
      ))
    ) {
      throw new ForbiddenException();
    }

    this.assertTimeRange(dto.startsAt, dto.endsAt);
    // The organizer's own inclusion is authorized by their meeting-creation
    // rights, not the "new participant" rule — validate only the others,
    // so an org-wide PROJECTS_VIEW_ALL organizer without formal membership
    // can still list themselves without tripping the membership check.
    const invitedIds = dto.participantIds.filter((id) => id !== actor.id);
    await this.assertValidParticipants(projectId, invitedIds);

    // docs/API.md: "El organizador es el actor y se incluye como participante."
    const participantIds = [actor.id, ...invitedIds];

    return this.prisma
      .$transaction(async (tx) => {
        // FOR UPDATE locks the project row for the rest of this transaction:
        // a concurrent soft-delete's UPDATE needs the same row lock, so it
        // either committed before us (and we correctly see deletedAt set) or
        // it blocks until after we commit (and the meeting is created under
        // the project as it existed at the moment we actually won the lock).
        // A plain read-then-create here would leave a gap where the project
        // could be deleted in between, leaving an orphaned-looking meeting.
        const [project] = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
        SELECT "deletedAt" FROM "projects" WHERE "id" = ${projectId}::uuid FOR UPDATE
      `;
        if (!project || project.deletedAt) throw new NotFoundException();

        const meeting = await tx.meeting.create({
          data: {
            projectId,
            title: dto.title,
            description: dto.description,
            startsAt: new Date(dto.startsAt),
            endsAt: new Date(dto.endsAt),
            organizerId: actor.id,
          },
        });
        await tx.meetingParticipant.createMany({
          data: participantIds.map((userId) => ({
            meetingId: meeting.id,
            userId,
            addedById: actor.id,
          })),
        });
        return tx.meeting.findUniqueOrThrow({
          where: { id: meeting.id },
          select: MEETING_SELECT,
        });
      })
      .then(async (created) => {
        // Best-effort, outside the transaction: a notification failure must
        // never undo or fail an already-committed meeting creation.
        await Promise.all([
          ...invitedIds.map((userId) =>
            this.notifications.notifyMeetingAdded({
              userId,
              actorId: actor.id,
              projectId,
              meetingId: created.id,
            }),
          ),
          this.activity.record({
            projectId,
            actorId: actor.id,
            type: 'MEETING_CREATED',
            entityType: 'Meeting',
            entityId: created.id,
          }),
        ]);
        return created;
      });
  }

  /**
   * docs/RBAC.md "Editar horario, agenda o participantes: MEETINGS_UPDATE y
   * ser organizador, MANAGER u override." Only structure (title/description/
   * schedule) — notes and participants have their own dedicated endpoints.
   *
   * docs/API.md notes "Un cambio significativo crea notificaciones y
   * recalcula recordatorios" — Notifications and MeetingReminder scheduling
   * are out of scope until their own dedicated phase builds the delivery
   * mechanism; creating reminder rows with nothing to ever deliver them
   * would be dead code.
   */
  async update(
    projectId: string,
    meetingId: string,
    dto: UpdateMeetingDto,
    actor: AuthenticatedUser,
  ) {
    const meeting = await this.getMeetingOrThrow(projectId, meetingId, actor);
    if (
      !(await this.canManageMeetingStructure(
        actor,
        meeting,
        projectId,
        'MEETINGS_UPDATE',
      ))
    ) {
      throw new ForbiddenException();
    }

    const nextStartsAt =
      dto.startsAt !== undefined ? dto.startsAt : meeting.startsAt;
    const nextEndsAt = dto.endsAt !== undefined ? dto.endsAt : meeting.endsAt;
    this.assertTimeRange(nextStartsAt, nextEndsAt);

    // "Significant" per docs/API.md: title or schedule actually changing
    // value, not merely being present in the request with their existing
    // value (nor a description-only edit).
    const isSignificantChange =
      (dto.title !== undefined && dto.title !== meeting.title) ||
      (dto.startsAt !== undefined &&
        new Date(dto.startsAt).getTime() !== meeting.startsAt.getTime()) ||
      (dto.endsAt !== undefined &&
        new Date(dto.endsAt).getTime() !== meeting.endsAt.getTime());

    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id: meetingId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.startsAt !== undefined
          ? { startsAt: toDateOrUndefined(dto.startsAt) }
          : {}),
        ...(dto.endsAt !== undefined
          ? { endsAt: toDateOrUndefined(dto.endsAt) }
          : {}),
      },
    });
    if (count === 0) throw new NotFoundException();

    const updated = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: MEETING_SELECT,
    });

    if (isSignificantChange) {
      // Best-effort, after the write has already committed. A
      // MeetingParticipant row can outlive its owner's project membership
      // (removing someone from a project doesn't cascade-remove their old
      // meeting participation), so re-check current active membership here
      // rather than notifying every historically-stored participant —
      // otherwise a former project member would keep getting notified about
      // a project they can no longer see.
      const recipientsToNotify = await Promise.all(
        meeting.participants
          .filter((participant) => participant.userId !== actor.id)
          .map(async (participant) => {
            const stillAMember = await this.access.getActiveMembership(
              participant.userId,
              projectId,
            );
            return stillAMember ? participant.userId : null;
          }),
      );
      await Promise.all(
        recipientsToNotify
          .filter((userId): userId is string => userId !== null)
          .map((userId) =>
            this.notifications.notifyMeetingUpdated({
              userId,
              actorId: actor.id,
              projectId,
              meetingId,
            }),
          ),
      );
    }

    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'MEETING_UPDATED',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  /** docs/API.md "Reemplaza participantes válidos sin retirar accidentalmente al organizador." */
  async setParticipants(
    projectId: string,
    meetingId: string,
    dto: SetMeetingParticipantsDto,
    actor: AuthenticatedUser,
  ) {
    const meeting = await this.getMeetingOrThrow(projectId, meetingId, actor);
    if (
      !(await this.canManageMeetingStructure(
        actor,
        meeting,
        projectId,
        'MEETINGS_UPDATE',
      ))
    ) {
      throw new ForbiddenException();
    }

    const invitedIds = dto.participantIds.filter(
      (id) => id !== meeting.organizerId,
    );
    await this.assertValidParticipants(projectId, invitedIds);
    const participantIds = [meeting.organizerId, ...invitedIds];
    const previousParticipantIds = new Set(
      meeting.participants.map((participant) => participant.userId),
    );
    const newlyAddedIds = participantIds.filter(
      (userId) => !previousParticipantIds.has(userId),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const stillLive = await tx.meeting.findFirst({
        where: {
          id: meetingId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
      });
      if (!stillLive) throw new NotFoundException();

      await tx.meetingParticipant.deleteMany({ where: { meetingId } });
      await tx.meetingParticipant.createMany({
        data: participantIds.map((userId) => ({
          meetingId,
          userId,
          addedById: actor.id,
        })),
      });

      const fresh = await tx.meeting.findFirst({
        where: {
          id: meetingId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
        select: MEETING_SELECT,
      });
      if (!fresh) throw new NotFoundException();
      return fresh;
    });

    // Best-effort, outside the transaction: only participants newly added by
    // this replacement (not ones already there before it) get notified.
    await Promise.all([
      ...newlyAddedIds.map((userId) =>
        this.notifications.notifyMeetingAdded({
          userId,
          actorId: actor.id,
          projectId,
          meetingId,
        }),
      ),
      this.activity.record({
        projectId,
        actorId: actor.id,
        type: 'MEETING_PARTICIPANTS_CHANGED',
        entityType: 'Meeting',
        entityId: meetingId,
        metadata: { participantIds },
      }),
    ]);
    return result;
  }

  /**
   * docs/API.md "Concurrencia": optimistic locking via `expectedRevision`.
   * docs/RBAC.md "Editar notas ... siempre respeta revision; autorización no
   * permite ignorar un conflicto" — the revision check applies uniformly,
   * even to the Owner or a MANAGER.
   */
  async updateNotes(
    projectId: string,
    meetingId: string,
    dto: UpdateMeetingNotesDto,
    actor: AuthenticatedUser,
  ) {
    const meeting = await this.getMeetingOrThrow(projectId, meetingId, actor);
    if (!(await this.canEditMeetingNotes(actor, meeting, projectId)))
      throw new ForbiddenException();

    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id: meetingId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
        revision: dto.expectedRevision,
      },
      data: {
        notes: dto.notes as Prisma.InputJsonValue,
        revision: { increment: 1 },
        notesUpdatedAt: new Date(),
        notesUpdatedById: actor.id,
      },
    });

    if (count === 0) {
      const current = await this.prisma.meeting.findFirst({
        where: {
          id: meetingId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
        select: { revision: true, notesUpdatedAt: true },
      });
      if (!current) throw new NotFoundException();
      throw new MeetingNotesRevisionConflictException(
        current.revision,
        current.notesUpdatedAt,
      );
    }

    const updated = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: MEETING_SELECT,
    });

    // Metadata intentionally excludes note content (docs/DATABASE.md forbids
    // storing full note/document bodies in activity/audit metadata).
    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'MEETING_NOTES_UPDATED',
      entityType: 'Meeting',
      entityId: meetingId,
      metadata: { revision: updated.revision },
    });

    return updated;
  }

  /** docs/RBAC.md "Eliminar: MEETINGS_DELETE y ser organizador, MANAGER u override." */
  async delete(
    projectId: string,
    meetingId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const meeting = await this.getMeetingOrThrow(projectId, meetingId, actor);
    if (
      !(await this.canManageMeetingStructure(
        actor,
        meeting,
        projectId,
        'MEETINGS_DELETE',
      ))
    ) {
      throw new ForbiddenException();
    }

    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id: meetingId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });
    if (count === 0) throw new NotFoundException();

    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'MEETING_DELETED',
      entityType: 'Meeting',
      entityId: meetingId,
    });
  }

  /** docs/RBAC.md "Verifica que [el recurso] pertenezca al proyecto de la URL y que el actor vea el proyecto." (same rule as tasks). */
  private async getMeetingOrThrow(
    projectId: string,
    meetingId: string,
    actor: AuthenticatedUser,
  ): Promise<MeetingWithParticipants> {
    await this.access.assertCanViewProject(actor, projectId);
    // `project: { deletedAt: null }` re-asserted here too, not just via
    // assertCanViewProject above — closes the same narrow gap as list().
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id: meetingId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: MEETING_SELECT,
    });
    if (!meeting) throw new NotFoundException();
    return meeting;
  }

  private async canManageMeetingStructure(
    actor: AuthenticatedUser,
    meeting: { organizerId: string },
    projectId: string,
    permissionKey: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has(permissionKey)) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    if (meeting.organizerId === actor.id) return true;

    const membership = await this.access.getActiveMembership(
      actor.id,
      projectId,
    );
    return membership?.role === 'MANAGER';
  }

  private async canEditMeetingNotes(
    actor: AuthenticatedUser,
    meeting: MeetingWithParticipants,
    projectId: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has('MEETINGS_UPDATE')) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    if (
      meeting.participants.some(
        (participant) => participant.userId === actor.id,
      )
    )
      return true;

    const membership = await this.access.getActiveMembership(
      actor.id,
      projectId,
    );
    return membership?.role === 'MANAGER';
  }

  private async getViewerCapabilities(
    actor: AuthenticatedUser,
    meeting: MeetingWithParticipants,
    projectId: string,
  ): Promise<MeetingViewerCapabilities> {
    const [membership, canEditStructure, canEditNotes, canDelete] =
      await Promise.all([
        actor.isOwner
          ? Promise.resolve(null)
          : this.access.getActiveMembership(actor.id, projectId),
        this.canManageMeetingStructure(
          actor,
          meeting,
          projectId,
          'MEETINGS_UPDATE',
        ),
        this.canEditMeetingNotes(actor, meeting, projectId),
        this.canManageMeetingStructure(
          actor,
          meeting,
          projectId,
          'MEETINGS_DELETE',
        ),
      ]);

    return {
      role: membership?.role ?? null,
      isOrganizer: meeting.organizerId === actor.id,
      isParticipant: meeting.participants.some(
        (participant) => participant.userId === actor.id,
      ),
      canEditStructure,
      canEditNotes,
      canDelete,
    };
  }

  /** docs/RBAC.md "Los nuevos participantes deben ser usuarios activos y miembros vigentes del proyecto." */
  private async assertValidParticipants(
    projectId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    const [activeUsers, activeMembers] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds }, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.projectMember.findMany({
        where: { projectId, userId: { in: userIds }, removedAt: null },
        select: { userId: true },
      }),
    ]);
    if (
      activeUsers.length !== userIds.length ||
      activeMembers.length !== userIds.length
    ) {
      throw new BadRequestException(
        'All participants must be active users and current members of this project.',
      );
    }
  }

  private assertTimeRange(
    startsAt: Date | string,
    endsAt: Date | string,
  ): void {
    if (new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }
  }
}
