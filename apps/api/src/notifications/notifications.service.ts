import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ListNotificationsDto } from './dto/list-notifications.dto.js';
import { Prisma } from '../generated/prisma/client.js';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  actorId: true,
  projectId: true,
  taskId: true,
  meetingId: true,
  payload: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** docs/API.md "Sólo notificaciones propias." */
  async list(
    actor: AuthenticatedUser,
    query: ListNotificationsDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      userId: actor.id,
      ...(query.read !== undefined
        ? { readAt: query.read ? { not: null } : null }
        : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: NOTIFICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  async unreadCount(actor: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId: actor.id, readAt: null },
    });
    return { count };
  }

  /** docs/API.md "Marca una notificación propia como leída de forma idempotente." */
  async markRead(
    actor: AuthenticatedUser,
    notificationId: string,
  ): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count > 0) return;

    // count === 0 means either "not mine / doesn't exist" (404 — never
    // reveal another user's notification, docs/RBAC.md "no permiten
    // consultar recursos equivalentes de otra persona cambiando un ID") or
    // "already read" (idempotent success).
    const exists = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: actor.id },
    });
    if (!exists) throw new NotFoundException();
  }

  async markAllRead(actor: AuthenticatedUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * docs/DATABASE.md: TASK_ASSIGNED. Called when a user newly becomes a task
   * assignee (create or a replacement via PUT .../assignees). Never notifies
   * the actor about their own action.
   *
   * No dedupeKey: per docs/DATABASE.md, "dedupeKey evita duplicar
   * recordatorios y otros eventos reintentables" — it exists for events a
   * scheduler might replay (reminders), not for this synchronous, one-shot
   * call site. A permanent per-task/user key would incorrectly suppress a
   * legitimate re-notification if someone is unassigned and later
   * genuinely reassigned.
   */
  async notifyTaskAssigned(params: {
    userId: string;
    actorId: string;
    projectId: string;
    taskId: string;
  }): Promise<void> {
    if (params.userId === params.actorId) return;
    await this.safeCreate({
      userId: params.userId,
      type: 'TASK_ASSIGNED',
      actorId: params.actorId,
      projectId: params.projectId,
      taskId: params.taskId,
    });
  }

  /**
   * docs/DATABASE.md: MEETING_ADDED. Called when a user newly becomes a
   * meeting participant (create or a replacement via PUT .../participants).
   * No dedupeKey — see notifyTaskAssigned's comment; the same reasoning
   * applies to being removed and later genuinely re-added.
   */
  async notifyMeetingAdded(params: {
    userId: string;
    actorId: string;
    projectId: string;
    meetingId: string;
  }): Promise<void> {
    if (params.userId === params.actorId) return;
    await this.safeCreate({
      userId: params.userId,
      type: 'MEETING_ADDED',
      actorId: params.actorId,
      projectId: params.projectId,
      meetingId: params.meetingId,
    });
  }

  /**
   * docs/API.md "Un cambio significativo crea notificaciones." No dedupeKey
   * — see notifyTaskAssigned's comment. A key derived from `updatedAt` was
   * tried and rejected: two genuinely distinct significant updates reading
   * the same post-write timestamp (millisecond precision, separate SELECT
   * after the UPDATE) could collide and silently drop the second
   * notification, which is worse than not deduping at all here.
   */
  async notifyMeetingUpdated(params: {
    userId: string;
    actorId: string;
    projectId: string;
    meetingId: string;
  }): Promise<void> {
    if (params.userId === params.actorId) return;
    await this.safeCreate({
      userId: params.userId,
      type: 'MEETING_UPDATED',
      actorId: params.actorId,
      projectId: params.projectId,
      meetingId: params.meetingId,
    });
  }

  /**
   * Notifications are a best-effort side channel, never the source of
   * truth: any failure here must never fail the caller's primary operation
   * (assigning a task, updating a meeting, ...), so every error is logged
   * and swallowed rather than propagated. (A dedupeKey conflict is still
   * handled defensively for any future caller that does set one, e.g. the
   * eventual reminder scheduler.)
   */
  private async safeCreate(
    data: Prisma.NotificationUncheckedCreateInput,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      this.logger.warn(
        `Failed to create a ${data.type} notification for user ${data.userId}: ${String(error)}`,
      );
    }
  }
}
