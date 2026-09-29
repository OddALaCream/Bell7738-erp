import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CurrentAuditContext } from '../audit/audit-context.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { AuditContext } from '../audit/audit-context.decorator.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { RolesService } from '../rbac/roles.service.js';
import { AssignRolesDto } from '../rbac/dto/assign-roles.dto.js';
import { UsersService } from './users.service.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { ListTeamDto } from './dto/list-team.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
  ) {}

  @Get('users')
  @RequirePermissions('USERS_VIEW')
  list(@Query() query: ListUsersDto) {
    return this.users.list(query);
  }

  @Get('users/:userId')
  @RequirePermissions('USERS_VIEW')
  getById(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getById(userId);
  }

  @Patch('users/:userId')
  @RequirePermissions('USERS_UPDATE')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.users.update(userId, dto, actor.id, context);
  }

  @Post('users/:userId/suspend')
  @RequirePermissions('USERS_DISABLE')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.users.suspend(userId, actor.id, context);
  }

  @Post('users/:userId/reactivate')
  @RequirePermissions('USERS_UPDATE')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.users.reactivate(userId, actor.id, context);
  }

  @Post('users/:userId/disable')
  @RequirePermissions('USERS_DISABLE')
  @HttpCode(HttpStatus.OK)
  disable(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.users.disable(userId, actor.id, context);
  }

  @Put('users/:userId/roles')
  @RequirePermissions('USERS_ROLES_MANAGE')
  @HttpCode(HttpStatus.OK)
  assignRoles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentAuditContext() context: AuditContext,
  ) {
    return this.roles
      .assignRolesToUser(userId, dto.roleIds, actor, context)
      .then(() => this.users.getById(userId));
  }

  @Get('users/:userId/profile')
  getUserProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.getPublicProfile(userId, actor);
  }

  @Get('me/profile')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getOwnProfile(user);
  }

  @Patch('me/profile')
  updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateOwnProfile(user.id, dto);
  }

  @Get('team')
  listTeam(@Query() query: ListTeamDto) {
    return this.users.listTeam(query);
  }
}
