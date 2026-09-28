import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import { ProjectAccessService } from './project-access.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import { toDateOrNull, toDateOrUndefined } from '../common/dates.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';
import type { ListProjectsDto } from './dto/list-projects.dto.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly access: ProjectAccessService,
  ) {}

  /** docs/RBAC.md "Listados aplican el scope en la consulta; no recuperan todo para filtrar en memoria." */
  async list(
    query: ListProjectsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    const scopeWhere = await this.buildScopeWhere(actor);
    if (scopeWhere === null) {
      return paginate([], 0, query.page, query.pageSize);
    }

    const now = new Date();
    const endingSoonCutoff = new Date(
      now.getTime() + this.config.projects.endingSoonDays * 24 * 60 * 60 * 1000,
    );

    const viewWhere: Prisma.ProjectWhereInput =
      query.view === 'active'
        ? { status: 'ACTIVE' }
        : query.view === 'completed'
          ? { status: 'COMPLETED' }
          : query.view === 'paused'
            ? { status: 'PAUSED' }
            : query.view === 'endingSoon'
              ? {
                  status: { notIn: ['COMPLETED', 'CANCELLED'] },
                  expectedEndDate: { gte: now, lte: endingSoonCutoff },
                }
              : query.view === 'overdue'
                ? {
                    status: { notIn: ['COMPLETED', 'CANCELLED'] },
                    expectedEndDate: { lt: now },
                  }
                : {};

    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...scopeWhere,
      ...(query.status ? { status: query.status } : {}),
      ...viewWhere,
      ...(query.startFrom || query.startTo
        ? {
            startDate: {
              ...(query.startFrom ? { gte: new Date(query.startFrom) } : {}),
              ...(query.startTo ? { lte: new Date(query.startTo) } : {}),
            },
          }
        : {}),
      ...(query.endFrom || query.endTo
        ? {
            expectedEndDate: {
              ...(query.endFrom ? { gte: new Date(query.endFrom) } : {}),
              ...(query.endTo ? { lte: new Date(query.endTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                clientName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  /** Returns null (not `{}`) to mean "no visibility at all — return an empty list without querying". */
  private async buildScopeWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.ProjectWhereInput | null> {
    if (actor.isOwner) return {};

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (keys.has('PROJECTS_VIEW_ALL')) return {};
    if (keys.has('PROJECTS_VIEW_ASSIGNED')) {
      return { members: { some: { userId: actor.id, removedAt: null } } };
    }
    return null;
  }

  async getById(projectId: string, actor: AuthenticatedUser) {
    const project = await this.access.assertCanViewProject(actor, projectId);
    const viewerCapabilities = await this.access.getViewerCapabilities(
      actor,
      projectId,
    );
    return { ...project, viewerCapabilities };
  }

  /** docs/API.md: "Requiere PROJECTS_CREATE y capacidad de vista asignada o global." */
  async create(dto: CreateProjectDto, actor: AuthenticatedUser) {
    if (!actor.isOwner) {
      const keys = await this.effectivePermissions.getEffectivePermissionKeys(
        actor.id,
      );
      if (
        !keys.has('PROJECTS_VIEW_ASSIGNED') &&
        !keys.has('PROJECTS_VIEW_ALL')
      ) {
        throw new ForbiddenException();
      }
    }

    this.assertDateRange(dto.startDate, dto.expectedEndDate);
    const completedAt = dto.status === 'COMPLETED' ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          clientName: dto.clientName,
          status: dto.status,
          startDate: toDateOrUndefined(dto.startDate),
          expectedEndDate: toDateOrUndefined(dto.expectedEndDate),
          completedAt,
          createdById: actor.id,
        },
      });
      // docs/RBAC.md: "El creador se añade como MANAGER."
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: actor.id,
          role: 'MANAGER',
          addedById: actor.id,
        },
      });
      return project;
    });
  }

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    actor: AuthenticatedUser,
  ) {
    const project = await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.canManageProject(actor, projectId, 'PROJECTS_UPDATE'))
    ) {
      throw new ForbiddenException();
    }

    const nextStartDate =
      dto.startDate !== undefined ? dto.startDate : project.startDate;
    const nextEndDate =
      dto.expectedEndDate !== undefined
        ? dto.expectedEndDate
        : project.expectedEndDate;
    this.assertDateRange(nextStartDate, nextEndDate);

    // docs' DB CHECK: (status = 'COMPLETED') = (completedAt IS NOT NULL).
    // Resolved here so a status change always keeps completedAt coherent
    // without relying on the raw constraint to reject a bad combination.
    const statusFields =
      dto.status === undefined
        ? {}
        : dto.status === 'COMPLETED'
          ? {
              status: dto.status,
              completedAt: project.completedAt ?? new Date(),
            }
          : { status: dto.status, completedAt: null };

    // Conditional on deletedAt: null in the same statement (not a separate
    // check) so a concurrent DELETE can't commit in the gap between
    // assertCanViewProject above and this write and have it silently
    // resurrect/mutate an otherwise-hidden, logically-deleted project.
    const { count } = await this.prisma.project.updateMany({
      where: { id: projectId, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.clientName !== undefined ? { clientName: dto.clientName } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: toDateOrNull(dto.startDate) }
          : {}),
        ...(dto.expectedEndDate !== undefined
          ? { expectedEndDate: toDateOrNull(dto.expectedEndDate) }
          : {}),
        ...statusFields,
      },
    });
    if (count === 0) throw new NotFoundException();

    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  async delete(projectId: string, actor: AuthenticatedUser): Promise<void> {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.canManageProject(actor, projectId, 'PROJECTS_DELETE'))
    ) {
      throw new ForbiddenException();
    }

    // Logical delete only — docs/API.md "Realiza baja lógica, no cascade físico."
    const { count } = await this.prisma.project.updateMany({
      where: { id: projectId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });
    if (count === 0) throw new NotFoundException();
  }

  private assertDateRange(
    startDate: Date | string | null | undefined,
    expectedEndDate: Date | string | null | undefined,
  ): void {
    if (!startDate || !expectedEndDate) return;
    if (new Date(expectedEndDate) < new Date(startDate)) {
      throw new BadRequestException(
        'expectedEndDate cannot be before startDate.',
      );
    }
  }
}
