import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../rbac/permissions.module.js';
import { AuditController } from './audit.controller.js';
import { AuditWriterModule } from './audit-writer.module.js';

@Module({
  imports: [AuthModule, PermissionsModule, AuditWriterModule],
  controllers: [AuditController],
  exports: [AuditWriterModule],
})
export class AuditModule {}
