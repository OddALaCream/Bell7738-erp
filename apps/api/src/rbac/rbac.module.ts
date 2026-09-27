import { Module } from '@nestjs/common';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  providers: [EffectivePermissionsService, PermissionsGuard],
  exports: [EffectivePermissionsService, PermissionsGuard],
})
export class RbacModule {}
