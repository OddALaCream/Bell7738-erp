import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RolesController],
  providers: [EffectivePermissionsService, PermissionsGuard, RolesService],
  exports: [EffectivePermissionsService, PermissionsGuard, RolesService],
})
export class RbacModule {}
