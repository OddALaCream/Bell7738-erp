import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { ActivityService } from './activity.service.js';
import { ListActivityDto } from './dto/list-activity.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('activity')
  listFeed(
    @Query() query: ListActivityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.activity.listFeed(query, actor);
  }

  @Get('projects/:projectId/activity')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListActivityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.activity.list(projectId, query, actor);
  }
}
