import {
  BadRequestException,
  ConflictException,
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
import type { AuthenticatedUser } from '../auth/types.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import type { ListTasksDto } from './dto/list-tasks.dto.js';
import type { SetTaskAssigneesDto } from './dto/set-task-assignees.dto.js';
import type { Prisma } from '../generated/prisma/client.js';

const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  startDate: true,
  dueDate: true,
  status: true,
  createdById: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignees: {
    select: {
      userId: true,
      assignedAt: true,
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

type TaskWithAssignees = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  async list(
    projectId: string,
    query: ListTasksDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    await this.access.assertCanViewProject(actor, projectId);

    const where: Prisma.TaskWhereInput = {
      projectId,
      deletedAt: null,
      // Re-asserted here (not just via assertCanViewProject above) so a
      // project soft-deleted in the gap between that check and this query
      // can't still surface its tasks.
      project: { deletedAt: null },
      ...(query.status
        ? { status: query.status }
        : query.includeCompleted
          ? {}
          : { status: { not: 'DONE' } }),
      ...(query.assigneeId
        ? { assignees: { some: { userId: query.assigneeId } } }
        : {}),
      ...(query.from || query.to
        ? {
            dueDate: {
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
      this.prisma.task.findMany({
        where,
        select: TASK_SELECT,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  async getById(projectId: string, taskId: string, actor: AuthenticatedUser) {
    return this.getTaskOrThrow(projectId, taskId, actor);
  }

  /** docs/RBAC.md "Crear: TASKS_CREATE y rol MEMBER o MANAGER, o override." */
  async create(
    projectId: string,
    dto: CreateTaskDto,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.hasMemberLevelAccess(
        actor,
        projectId,
        'TASKS_CREATE',
      ))
    ) {
      throw new ForbiddenException();
    }

    this.assertDateRange(dto.startDate, dto.dueDate);
    await this.assertValidAssignees(projectId, dto.assigneeIds);

    return this.prisma
      .$transaction(async (tx) => {
        // FOR UPDATE locks the project row for the rest of this transaction:
        // a concurrent soft-delete's UPDATE needs the same row lock, so it
        // either committed before us (and we correctly see deletedAt set) or
        // it blocks until after we commit. A plain read-then-create here
        // would leave a gap where the project could be deleted in between,
        // leaving an orphaned-looking task under it.
        const [project] = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
        SELECT "deletedAt" FROM "projects" WHERE "id" = ${projectId}::uuid FOR UPDATE
      `;
        if (!project || project.deletedAt) throw new NotFoundException();

        const task = await tx.task.create({
          data: {
            projectId,
            title: dto.title,
            description: dto.description,
            startDate: new Date(dto.startDate),
            dueDate: new Date(dto.dueDate),
            status: 'PENDING',
            createdById: actor.id,
          },
        });
        await tx.taskAssignee.createMany({
          data: dto.assigneeIds.map((userId) => ({
            taskId: task.id,
            userId,
            assignedById: actor.id,
          })),
        });
        return tx.task.findUniqueOrThrow({
          where: { id: task.id },
          select: TASK_SELECT,
        });
      })
      .then(async (created) => {
        // Best-effort, outside the transaction: a notification/activity
        // failure must never undo or fail an already-committed task creation.
        await Promise.all([
          ...dto.assigneeIds.map((userId) =>
            this.notifications.notifyTaskAssigned({
              userId,
              actorId: actor.id,
              projectId,
              taskId: created.id,
            }),
          ),
          this.activity.record({
            projectId,
            actorId: actor.id,
            type: 'TASK_CREATED',
            entityType: 'Task',
            entityId: created.id,
            metadata: { title: created.title },
          }),
        ]);
        return created;
      });
  }

  /**
   * docs/RBAC.md "Editar contenido/fechas/asignados: TASKS_UPDATE y ser
   * creador, MANAGER u override." PATCH only moves between non-terminal
   * statuses (enforced by UpdateTaskDto) — leaving DONE is the dedicated,
   * more restrictive /reopen endpoint's job.
   */
  async update(
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
    actor: AuthenticatedUser,
  ) {
    const task = await this.getTaskOrThrow(projectId, taskId, actor);
    if (!(await this.canEditTask(actor, task, projectId)))
      throw new ForbiddenException();

    if (dto.status !== undefined && task.status === 'DONE') {
      throw new ConflictException(
        'This task is completed; use the reopen endpoint to change its status.',
      );
    }

    const nextStartDate =
      dto.startDate !== undefined ? dto.startDate : task.startDate;
    const nextDueDate = dto.dueDate !== undefined ? dto.dueDate : task.dueDate;
    this.assertDateRange(nextStartDate, nextDueDate);

    // `project: { deletedAt: null }` ties the write to the project's CURRENT
    // state at the moment the UPDATE executes (a relation filter, not a
    // stale read), closing the gap between the visibility check above and
    // this write — a concurrent project soft-delete can't slip a mutation
    // through in between.
    const { count } = await this.prisma.task.updateMany({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: toDateOrUndefined(dto.startDate) }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: toDateOrUndefined(dto.dueDate) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    if (count === 0) throw new NotFoundException();

    const updated = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: TASK_SELECT,
    });
    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'TASK_UPDATED',
      entityType: 'Task',
      entityId: taskId,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  /** docs/API.md: "Operación idempotente que establece DONE y completedAt." */
  async complete(projectId: string, taskId: string, actor: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(projectId, taskId, actor);
    if (!(await this.canCompleteTask(actor, task, projectId)))
      throw new ForbiddenException();

    // No-ops (via the `status: { not: 'DONE' }` guard) if already DONE —
    // idempotent by construction, not by a separate early-return branch.
    // `project: { deletedAt: null }` closes the same concurrent
    // soft-delete gap described in update() above.
    await this.prisma.task.updateMany({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
        status: { not: 'DONE' },
      },
      data: { status: 'DONE', completedAt: new Date() },
    });

    const fresh = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: TASK_SELECT,
    });
    if (!fresh) throw new NotFoundException();

    // Only record on a genuine transition, not on a repeat idempotent call.
    if (task.status !== 'DONE') {
      await this.activity.record({
        projectId,
        actorId: actor.id,
        type: 'TASK_COMPLETED',
        entityType: 'Task',
        entityId: taskId,
      });
    }
    return fresh;
  }

  /** docs/RBAC.md "Reabrir: TASKS_UPDATE y ser MANAGER u override" — stricter than a plain edit; the creator alone cannot reopen. */
  async reopen(projectId: string, taskId: string, actor: AuthenticatedUser) {
    await this.getTaskOrThrow(projectId, taskId, actor);
    if (
      !(await this.access.canManageProject(actor, projectId, 'TASKS_UPDATE'))
    ) {
      throw new ForbiddenException();
    }

    const { count } = await this.prisma.task.updateMany({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
        status: 'DONE',
      },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });
    if (count === 0) {
      const stillExists = await this.prisma.task.findFirst({
        where: {
          id: taskId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
      });
      if (!stillExists) throw new NotFoundException();
      throw new ConflictException('Task is not completed.');
    }

    const reopened = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: TASK_SELECT,
    });
    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'TASK_REOPENED',
      entityType: 'Task',
      entityId: taskId,
    });
    return reopened;
  }

  /** docs/RBAC.md "Eliminar: TASKS_DELETE y ser MANAGER u override." */
  async delete(
    projectId: string,
    taskId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.getTaskOrThrow(projectId, taskId, actor);
    if (
      !(await this.access.canManageProject(actor, projectId, 'TASKS_DELETE'))
    ) {
      throw new ForbiddenException();
    }

    const { count } = await this.prisma.task.updateMany({
      where: {
        id: taskId,
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
      type: 'TASK_DELETED',
      entityType: 'Task',
      entityId: taskId,
    });
  }

  /** docs/API.md "Reemplaza el conjunto completo sin permitir cero asignados." Same authorization as a content edit. */
  async setAssignees(
    projectId: string,
    taskId: string,
    dto: SetTaskAssigneesDto,
    actor: AuthenticatedUser,
  ) {
    const task = await this.getTaskOrThrow(projectId, taskId, actor);
    if (!(await this.canEditTask(actor, task, projectId)))
      throw new ForbiddenException();

    await this.assertValidAssignees(projectId, dto.assigneeIds);
    const previousAssigneeIds = new Set(
      task.assignees.map((assignee) => assignee.userId),
    );
    const newlyAddedAssigneeIds = dto.assigneeIds.filter(
      (userId) => !previousAssigneeIds.has(userId),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const stillLive = await tx.task.findFirst({
        where: {
          id: taskId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
      });
      if (!stillLive) throw new NotFoundException();

      await tx.taskAssignee.deleteMany({ where: { taskId } });
      await tx.taskAssignee.createMany({
        data: dto.assigneeIds.map((userId) => ({
          taskId,
          userId,
          assignedById: actor.id,
        })),
      });

      // Re-check rather than trusting `stillLive` from above: a concurrent
      // soft-delete of the task or its project could have committed between
      // that read and these writes (this transaction holds no lock on
      // either row), and the response must reflect the current truth.
      const fresh = await tx.task.findFirst({
        where: {
          id: taskId,
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
        },
        select: TASK_SELECT,
      });
      if (!fresh) throw new NotFoundException();
      return fresh;
    });

    // Best-effort, outside the transaction: only newly-added assignees (not
    // ones who were already assigned before this replacement) get notified.
    await Promise.all([
      ...newlyAddedAssigneeIds.map((userId) =>
        this.notifications.notifyTaskAssigned({
          userId,
          actorId: actor.id,
          projectId,
          taskId,
        }),
      ),
      this.activity.record({
        projectId,
        actorId: actor.id,
        type: 'TASK_ASSIGNEES_CHANGED',
        entityType: 'Task',
        entityId: taskId,
        metadata: { assigneeIds: dto.assigneeIds },
      }),
    ]);
    return result;
  }

  /** docs/RBAC.md "Verifica que la tarea pertenezca al proyecto de la URL y que el actor vea el proyecto." */
  private async getTaskOrThrow(
    projectId: string,
    taskId: string,
    actor: AuthenticatedUser,
  ): Promise<TaskWithAssignees> {
    await this.access.assertCanViewProject(actor, projectId);
    // `project: { deletedAt: null }` re-asserted here too, not just via
    // assertCanViewProject above — closes the same narrow gap as list().
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: TASK_SELECT,
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private async canEditTask(
    actor: AuthenticatedUser,
    task: { createdById: string },
    projectId: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has('TASKS_UPDATE')) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    if (task.createdById === actor.id) return true;

    const membership = await this.access.getActiveMembership(
      actor.id,
      projectId,
    );
    return membership?.role === 'MANAGER';
  }

  private async canCompleteTask(
    actor: AuthenticatedUser,
    task: TaskWithAssignees,
    projectId: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has('TASKS_COMPLETE')) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    if (task.assignees.some((assignee) => assignee.userId === actor.id))
      return true;

    const membership = await this.access.getActiveMembership(
      actor.id,
      projectId,
    );
    return membership?.role === 'MANAGER';
  }

  /** docs/RBAC.md "Los nuevos asignados deben ser usuarios activos y miembros vigentes del mismo proyecto." */
  private async assertValidAssignees(
    projectId: string,
    userIds: string[],
  ): Promise<void> {
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
        'All assignees must be active users and current members of this project.',
      );
    }
  }

  private assertDateRange(
    startDate: Date | string,
    dueDate: Date | string,
  ): void {
    if (new Date(dueDate) < new Date(startDate)) {
      throw new BadRequestException('dueDate cannot be before startDate.');
    }
  }
}
