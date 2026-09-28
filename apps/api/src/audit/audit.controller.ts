import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { AuditService } from './audit.service.js';
import { ListAuditDto } from './dto/list-audit.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit')
  @RequirePermissions('AUDIT_VIEW')
  list(@Query() query: ListAuditDto) {
    return this.audit.list(query);
  }

  @Get('audit/:auditId')
  @RequirePermissions('AUDIT_VIEW')
  getById(@Param('auditId', ParseUUIDPipe) auditId: string) {
    return this.audit.getById(auditId);
  }
}
