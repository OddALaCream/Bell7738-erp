import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PermissionsModule } from './permissions.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [AuthModule, PermissionsModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [PermissionsModule, RolesService],
})
export class RbacModule {}
