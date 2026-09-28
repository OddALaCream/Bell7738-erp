import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CurrentAuditContext } from '../audit/audit-context.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { AuditContext } from '../audit/audit-context.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RequirePermissions } from './require-permissions.decorator.js';
import { RolesService } from './roles.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  listPermissions(@CurrentUser() actor: AuthenticatedUser) {
    return this.roles.listPermissions(actor);
  }

  @Get('roles')
  listRoles(@CurrentUser() actor: AuthenticatedUser) {
    return this.roles.listRoles(actor);
  }

  @Post('roles')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ROLES_MANAGE')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.roles.create(dto, actor, context);
  }

  @Get('roles/:roleId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ROLES_VIEW')
  getById(@Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.roles.getById(roleId);
  }

  @Patch('roles/:roleId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ROLES_MANAGE')
  update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.roles.update(roleId, dto, actor, context);
  }

  @Delete('roles/:roleId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('ROLES_MANAGE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<void> {
    return this.roles.delete(roleId, actor, context);
  }
}
