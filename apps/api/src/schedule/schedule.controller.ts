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
import { ScheduleService } from './schedule.service.js';
import { TimelineQueryDto } from './dto/timeline-query.dto.js';
import { CalendarQueryDto } from './dto/calendar-query.dto.js';
import { MyScheduleQueryDto } from './dto/my-schedule-query.dto.js';

/** docs/RBAC.md: same visibility rule as any other project read (no dedicated permission). */
@Controller({ version: '1' })
@UseGuards(SessionAuthGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('projects/:projectId/timeline')
  timeline(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: TimelineQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.schedule.timeline(projectId, query, actor);
  }

  @Get('projects/:projectId/calendar')
  calendar(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: CalendarQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.schedule.calendar(projectId, query, actor);
  }

  /** docs/API.md "Mi cronograma": global, scoped to the caller only. */
  @Get('me/schedule')
  mySchedule(
    @Query() query: MyScheduleQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.schedule.mySchedule(query, actor);
  }
}
