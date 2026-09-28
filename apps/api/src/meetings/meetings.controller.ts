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
import { MeetingsService } from './meetings.service.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import { ListMeetingsDto } from './dto/list-meetings.dto.js';
import { SetMeetingParticipantsDto } from './dto/set-meeting-participants.dto.js';
import { UpdateMeetingNotesDto } from './dto/update-meeting-notes.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('projects/:projectId/meetings')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListMeetingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.list(projectId, query, actor);
  }

  @Post('projects/:projectId/meetings')
  @RequirePermissions('MEETINGS_CREATE')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateMeetingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.create(projectId, dto, actor);
  }

  @Get('projects/:projectId/meetings/:meetingId')
  getById(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.getById(projectId, meetingId, actor);
  }

  @Patch('projects/:projectId/meetings/:meetingId')
  @RequirePermissions('MEETINGS_UPDATE')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.update(projectId, meetingId, dto, actor);
  }

  @Put('projects/:projectId/meetings/:meetingId/participants')
  @RequirePermissions('MEETINGS_UPDATE')
  setParticipants(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: SetMeetingParticipantsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.setParticipants(projectId, meetingId, dto, actor);
  }

  @Patch('projects/:projectId/meetings/:meetingId/notes')
  @RequirePermissions('MEETINGS_UPDATE')
  updateNotes(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: UpdateMeetingNotesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetings.updateNotes(projectId, meetingId, dto, actor);
  }

  @Delete('projects/:projectId/meetings/:meetingId')
  @RequirePermissions('MEETINGS_DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.meetings.delete(projectId, meetingId, actor);
  }
}
