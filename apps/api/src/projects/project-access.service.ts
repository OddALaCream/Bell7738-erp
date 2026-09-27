import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { Project, ProjectMemberRole } from '../generated/prisma/client.js';

export interface ProjectViewerCapabilities {
  role: ProjectMemberRole | null;
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
}

/**
 * Shared docs/RBAC.md "Visibilidad de proyecto" / "Rol local de proyecto" /
 * "Override organizacional" logic, reused by Projects now and by Tasks,
 * Meetings, and Documents in later phases — see rbac.module.ts's
 * EffectivePermissionsService for the equivalent global-permission pattern.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  async getActiveMembership(
    userId: string,
    projectId: string,
  ): Promise<{ role: ProjectMemberRole } | null> {
    return this.prisma.projectMember.findFirst({
      where: { projectId, userId, removedAt: null },
      select: { role: true },
    });
  }

  /** docs/RBAC.md "Visibilidad de proyecto": Owner, PROJECTS_VIEW_ALL, or PROJECTS_VIEW_ASSIGNED + active membership. */
  async canViewProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    if (!keys.has('PROJECTS_VIEW_ASSIGNED')) return false;

    return (await this.getActiveMembership(actor.id, projectId)) !== null;
  }

  /**
   * Fetches a non-deleted project and enforces visibility as a single step.
   * Always 404s (never 403) when the actor can't see it — docs/RBAC.md IDOR
   * rule: "Un recurso de proyecto que el actor no puede conocer normalmente
   * responde 404".
   */
  async assertCanViewProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.deletedAt) throw new NotFoundException();
    if (!(await this.canViewProject(actor, projectId)))
      throw new NotFoundException();
    return project;
  }

  /**
   * docs/RBAC.md "Reglas por recurso > Proyectos": editing, deleting, or
   * managing members requires the specific global permission AND (being the
   * project's MANAGER OR the PROJECTS_VIEW_ALL organizational override).
   * Callers must already have established visibility (assertCanViewProject)
   * before calling this — it only decides the write/manage authorization.
   */
  async canManageProject(
    actor: AuthenticatedUser,
    projectId: string,
    permissionKey: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has(permissionKey)) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;

    const membership = await this.getActiveMembership(actor.id, projectId);
    return membership?.role === 'MANAGER';
  }

  /** docs/RBAC.md "La API puede devolver permisos efectivos y membresía/rol del proyecto". */
  async getViewerCapabilities(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<ProjectViewerCapabilities> {
    const [membership, canUpdate, canDelete, canManageMembers] =
      await Promise.all([
        actor.isOwner
          ? Promise.resolve(null)
          : this.getActiveMembership(actor.id, projectId),
        this.canManageProject(actor, projectId, 'PROJECTS_UPDATE'),
        this.canManageProject(actor, projectId, 'PROJECTS_DELETE'),
        this.canManageProject(actor, projectId, 'PROJECT_MEMBERS_MANAGE'),
      ]);

    return {
      role: membership?.role ?? null,
      canUpdate,
      canDelete,
      canManageMembers,
    };
  }
}
