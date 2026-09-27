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
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { UsersService } from './users.service.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { ListTeamDto } from './dto/list-team.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
  ) {
    return this.users.update(userId, dto, actor.id);
  }

  @Post('users/:userId/suspend')
  @RequirePermissions('USERS_DISABLE')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.suspend(userId, actor.id);
  }

  @Post('users/:userId/reactivate')
  @RequirePermissions('USERS_UPDATE')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.reactivate(userId, actor.id);
  }

  @Post('users/:userId/disable')
  @RequirePermissions('USERS_DISABLE')
  @HttpCode(HttpStatus.OK)
  disable(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.disable(userId, actor.id);
  }

  @Get('users/:userId/profile')
  getUserProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getPublicProfile(userId);
  }

  @Get('me/profile')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getOwnProfile(user.id);
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
