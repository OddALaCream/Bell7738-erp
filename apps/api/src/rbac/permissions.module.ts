import { Module } from '@nestjs/common';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * Leaf module: just the permission-evaluation primitives (no RolesController/
 * RolesService), so consumers that only need @RequirePermissions / effective-
 * permission checks (Audit, ProjectAccess, and everything built on it) can
 * depend on this instead of the full RbacModule. RbacModule itself now needs
 * AuditModule (for RolesService's audit logging), and AuditModule needs the
 * permission guard for its own controller — importing the full RbacModule
 * from AuditModule would be circular, so AuditModule depends on this instead.
 */
@Module({
  providers: [EffectivePermissionsService, PermissionsGuard],
  exports: [EffectivePermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
