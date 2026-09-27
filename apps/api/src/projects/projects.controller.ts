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
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ListProjectsDto } from './dto/list-projects.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  list(
    @Query() query: ListProjectsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projects.list(query, actor);
  }

  @Post('projects')
  @RequirePermissions('PROJECTS_CREATE')
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projects.create(dto, actor);
  }

  @Get('projects/:projectId')
  getById(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projects.getById(projectId, actor);
  }

  @Patch('projects/:projectId')
  @RequirePermissions('PROJECTS_UPDATE')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.projects.update(projectId, dto, actor);
  }

  @Delete('projects/:projectId')
  @RequirePermissions('PROJECTS_DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.projects.delete(projectId, actor);
  }
}
