import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { TimelineQueryDto } from './dto/timeline-query.dto.js';
import type { CalendarQueryDto } from './dto/calendar-query.dto.js';
import type { MyScheduleQueryDto } from './dto/my-schedule-query.dto.js';
import type { Prisma, TaskStatus } from '../generated/prisma/client.js';

// docs/API.md: "rango máximo definido para evitar consultas excesivas."
const CALENDAR_MAX_RANGE_DAYS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const TIMELINE_TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  startDate: true,
  dueDate: true,
  status: true,
  assignees: {
    select: {
      userId: true,
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

export interface ScheduleTaskItem {
  kind: 'task';
  id: string;
  projectId: string;
  title: string;
  start: string;
  end: string;
  status: TaskStatus;
}

export interface ScheduleMeetingItem {
  kind: 'meeting';
  id: string;
  projectId: string;
  title: string;
  start: string;
  end: string;
}

export type ScheduleItem = ScheduleTaskItem | ScheduleMeetingItem;

function toScheduleTaskItem(task: {
  id: string;
  projectId: string;
  title: string;
  startDate: Date;
  dueDate: Date;
  status: TaskStatus;
}): ScheduleTaskItem {
  return {
    kind: 'task',
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    start: toDateOnly(task.startDate),
    end: toDateOnly(task.dueDate),
    status: task.status,
  };
}

function toScheduleMeetingItem(meeting: {
  id: string;
  projectId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}): ScheduleMeetingItem {
  return {
    kind: 'meeting',
    id: meeting.id,
    projectId: meeting.projectId,
    title: meeting.title,
    start: meeting.startsAt.toISOString(),
    end: meeting.endsAt.toISOString(),
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * docs/ARCHITECTURE.md: "Calendario, cronograma, Mi cronograma ... son
 * consultas o read models sobre módulos existentes. No justifican nuevas
 * tablas ni copias de tareas y reuniones." Every method here reads directly
 * from Task/Meeting; nothing is written or duplicated.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  /** docs/RBAC.md: same visibility rule as any other project read. */
  async timeline(
    projectId: string,
    query: TimelineQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    await this.access.assertCanViewProject(actor, projectId);
    this.assertOptionalRange(query.from, query.to);

    const where: Prisma.TaskWhereInput = {
      projectId,
      deletedAt: null,
      project: { deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId
        ? { assignees: { some: { userId: query.assigneeId } } }
        : {}),
      // Overlap: a task is "in range" if its span intersects [from, to].
      ...(query.from ? { dueDate: { gte: new Date(query.from) } } : {}),
      ...(query.to ? { startDate: { lte: new Date(query.to) } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: TIMELINE_TASK_SELECT,
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(
      data.map((task) => ({
        ...task,
        startDate: toDateOnly(task.startDate),
        dueDate: toDateOnly(task.dueDate),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** docs/API.md: combines tasks and meetings for one project into a discriminated union. */
  async calendar(
    projectId: string,
    query: CalendarQueryDto,
    actor: AuthenticatedUser,
  ): Promise<ScheduleItem[]> {
    await this.access.assertCanViewProject(actor, projectId);
    const { from, to, toExclusive } = this.assertValidRange(
      query.from,
      query.to,
    );

    const [tasks, meetings] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
          startDate: { lte: to },
          dueDate: { gte: from },
        },
        select: {
          id: true,
          projectId: true,
          title: true,
          startDate: true,
          dueDate: true,
          status: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: {
          projectId,
          deletedAt: null,
          project: { deletedAt: null },
          // Use a half-open instant range so the complete `to` calendar day
          // is included without leaking an event at the next day's midnight.
          startsAt: { lt: toExclusive },
          endsAt: { gt: from },
        },
        select: {
          id: true,
          projectId: true,
          title: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);

    return this.mergeChronologically(
      tasks.map(toScheduleTaskItem),
      meetings.map(toScheduleMeetingItem),
    );
  }

  /** docs/API.md "Mi cronograma": caller-owned items constrained by current project visibility. */
  async mySchedule(
    query: MyScheduleQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    const range = this.assertOptionalRange(query.from, query.to);
    const projectScope = await this.buildProjectScope(actor);
    if (projectScope === null) {
      return paginate([], 0, query.page, query.pageSize);
    }

    const start = (query.page - 1) * query.pageSize;
    const isCombined = query.kind === 'all';
    const queryLimit = isCombined ? start + query.pageSize : query.pageSize;
    const querySkip = isCombined ? 0 : start;

    const taskWhere: Prisma.TaskWhereInput = {
      deletedAt: null,
      project: { deletedAt: null, ...projectScope },
      assignees: { some: { userId: actor.id } },
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(range.from ? { dueDate: { gte: range.from } } : {}),
      ...(range.to ? { startDate: { lte: range.to } } : {}),
    };

    const meetingWhere: Prisma.MeetingWhereInput = {
      deletedAt: null,
      project: { deletedAt: null, ...projectScope },
      participants: { some: { userId: actor.id } },
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(range.from ? { endsAt: { gt: range.from } } : {}),
      ...(range.toExclusive ? { startsAt: { lt: range.toExclusive } } : {}),
    };

    const [tasks, taskTotal, meetings, meetingTotal] = await Promise.all([
      query.kind === 'meeting'
        ? Promise.resolve([])
        : this.prisma.task.findMany({
            where: taskWhere,
            select: {
              id: true,
              projectId: true,
              title: true,
              startDate: true,
              dueDate: true,
              status: true,
            },
            orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
            skip: querySkip,
            take: queryLimit,
          }),
      query.kind === 'meeting'
        ? Promise.resolve(0)
        : this.prisma.task.count({ where: taskWhere }),
      query.kind === 'task'
        ? Promise.resolve([])
        : this.prisma.meeting.findMany({
            where: meetingWhere,
            select: {
              id: true,
              projectId: true,
              title: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            skip: querySkip,
            take: queryLimit,
          }),
      query.kind === 'task'
        ? Promise.resolve(0)
        : this.prisma.meeting.count({ where: meetingWhere }),
    ]);

    const merged = this.mergeChronologically(
      tasks.map(toScheduleTaskItem),
      meetings.map(toScheduleMeetingItem),
    );

    const page = isCombined
      ? merged.slice(start, start + query.pageSize)
      : merged;
    return paginate(page, taskTotal + meetingTotal, query.page, query.pageSize);
  }

  private mergeChronologically(
    tasks: ScheduleTaskItem[],
    meetings: ScheduleMeetingItem[],
  ): ScheduleItem[] {
    return [...tasks, ...meetings].sort((a, b) => {
      const byStart = Date.parse(a.start) - Date.parse(b.start);
      if (byStart !== 0) return byStart;
      const byKind = a.kind.localeCompare(b.kind);
      return byKind !== 0 ? byKind : a.id.localeCompare(b.id);
    });
  }

  private assertOptionalRange(
    from: string | undefined,
    to: string | undefined,
  ): { from?: Date; to?: Date; toExclusive?: Date } {
    const fromDate = from === undefined ? undefined : new Date(from);
    const toDate = to === undefined ? undefined : new Date(to);
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestException('to must not be before from.');
    }
    return {
      from: fromDate,
      to: toDate,
      toExclusive:
        toDate === undefined ? undefined : new Date(toDate.getTime() + DAY_MS),
    };
  }

  private assertValidRange(
    from: string,
    to: string,
  ): { from: Date; to: Date; toExclusive: Date } {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (toDate < fromDate) {
      throw new BadRequestException('to must not be before from.');
    }
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / DAY_MS;
    if (rangeDays > CALENDAR_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `The date range cannot exceed ${CALENDAR_MAX_RANGE_DAYS} days.`,
      );
    }
    return {
      from: fromDate,
      to: toDate,
      toExclusive: new Date(toDate.getTime() + DAY_MS),
    };
  }

  /** docs/RBAC.md: list scope must be enforced by the database query itself. */
  private async buildProjectScope(
    actor: AuthenticatedUser,
  ): Promise<Prisma.ProjectWhereInput | null> {
    if (actor.isOwner) return {};

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (keys.has('PROJECTS_VIEW_ALL')) return {};
    if (keys.has('PROJECTS_VIEW_ASSIGNED')) {
      return {
        members: { some: { userId: actor.id, removedAt: null } },
      };
    }
    return null;
  }
}
