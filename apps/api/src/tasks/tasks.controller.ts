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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ListTasksDto } from './dto/list-tasks.dto.js';
import { SetTaskAssigneesDto } from './dto/set-task-assignees.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('projects/:projectId/tasks')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListTasksDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.list(projectId, query, actor);
  }

  @Post('projects/:projectId/tasks')
  @RequirePermissions('TASKS_CREATE')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.create(projectId, dto, actor);
  }

  @Get('projects/:projectId/tasks/:taskId')
  getById(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.getById(projectId, taskId, actor);
  }

  @Patch('projects/:projectId/tasks/:taskId')
  @RequirePermissions('TASKS_UPDATE')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.update(projectId, taskId, dto, actor);
  }

  @Post('projects/:projectId/tasks/:taskId/complete')
  @RequirePermissions('TASKS_COMPLETE')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.complete(projectId, taskId, actor);
  }

  @Post('projects/:projectId/tasks/:taskId/reopen')
  @RequirePermissions('TASKS_UPDATE')
  @HttpCode(HttpStatus.OK)
  reopen(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.reopen(projectId, taskId, actor);
  }

  @Put('projects/:projectId/tasks/:taskId/assignees')
  @RequirePermissions('TASKS_UPDATE')
  setAssignees(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SetTaskAssigneesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.setAssignees(projectId, taskId, dto, actor);
  }

  @Delete('projects/:projectId/tasks/:taskId')
  @RequirePermissions('TASKS_DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.tasks.delete(projectId, taskId, actor);
  }
}
