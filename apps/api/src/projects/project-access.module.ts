import { Module } from '@nestjs/common';
import { PermissionsModule } from '../rbac/permissions.module.js';
import { ProjectAccessService } from './project-access.service.js';

/**
 * Split out from ProjectsModule so leaf consumers (Tasks, Meetings,
 * Documents, Activity) can depend on just the shared visibility/authorization
 * primitive without importing the rest of Projects — and, critically,
 * without a cycle: ProjectsModule itself needs ActivityModule (to record
 * project-level activity), and ActivityModule needs ProjectAccessService.
 * If ActivityModule imported the full ProjectsModule, that would be circular.
 * Depends on the leaf PermissionsModule (not the full RbacModule, which now
 * also pulls in AuditModule) since ProjectAccessService only ever needs
 * EffectivePermissionsService.
 */
@Module({
  imports: [PermissionsModule],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
