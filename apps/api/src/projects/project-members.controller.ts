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
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { ProjectMembersService } from './project-members.service.js';
import { AddProjectMemberDto } from './dto/add-project-member.dto.js';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private readonly members: ProjectMembersService) {}

  @Get('projects/:projectId/members')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.members.list(projectId, actor);
  }

  @Post('projects/:projectId/members')
  @RequirePermissions('PROJECT_MEMBERS_MANAGE')
  add(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.members.add(projectId, dto, actor);
  }

  @Patch('projects/:projectId/members/:userId')
  @RequirePermissions('PROJECT_MEMBERS_MANAGE')
  updateRole(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateProjectMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.members.updateRole(projectId, userId, dto, actor);
  }

  @Delete('projects/:projectId/members/:userId')
  @RequirePermissions('PROJECT_MEMBERS_MANAGE')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.members.remove(projectId, userId, actor);
  }
}
