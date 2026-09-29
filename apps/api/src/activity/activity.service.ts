import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ListActivityDto } from './dto/list-activity.dto.js';
import type { ActivityEventType } from './activity-event-types.js';
import type { Prisma } from '../generated/prisma/client.js';

const ACTIVITY_SELECT = {
  id: true,
  projectId: true,
  actorId: true,
  type: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  // Readable feeds need who and where without one extra request per event.
  // Names only — no email or admin fields of the actor.
  actor: { select: { id: true, firstName: true, lastName: true } },
  project: { select: { id: true, name: true } },
} as const;

export interface RecordActivityInput {
  projectId: string;
  actorId: string | null;
  type: ActivityEventType;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  /** docs/RBAC.md "Actividad: Se puede leer con visibilidad del proyecto." */
  async list(
    projectId: string,
    query: ListActivityDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    await this.access.assertCanViewProject(actor, projectId);
    return this.page({ projectId, ...this.filters(query) }, query);
  }

  /**
   * Cross-project feed for the dashboard: the same events, limited in the
   * query to the projects the actor can see (docs/RBAC.md "Actividad").
   */
  async listFeed(
    query: ListActivityDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    const scope = await this.access.buildProjectScope(actor);
    if (scope === null) {
      return paginate([], 0, query.page, query.pageSize);
    }
    return this.page(
      { project: { deletedAt: null, ...scope }, ...this.filters(query) },
      query,
    );
  }

  private filters(query: ListActivityDto): Prisma.ActivityEventWhereInput {
    return {
      ...(query.type ? { type: query.type } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  private async page(
    where: Prisma.ActivityEventWhereInput,
    query: ListActivityDto,
  ): Promise<PaginatedResult<unknown>> {
    const [data, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.activityEvent.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  /**
   * docs/DATABASE.md: "Es append-only desde los casos de uso; no hay
   * endpoints de edición o borrado." Best-effort, like NotificationsService:
   * a logging failure must never fail the primary operation it's attached to.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.prisma.activityEvent.create({
        data: {
          projectId: input.projectId,
          actorId: input.actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record ${input.type} activity for project ${input.projectId}: ${String(error)}`,
      );
    }
  }
}
