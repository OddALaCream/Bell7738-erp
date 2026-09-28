import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @Query() query: ListNotificationsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notifications.list(actor, query);
  }

  @Get('notifications/unread-count')
  unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.unreadCount(actor);
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notifications.markRead(actor, notificationId);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor);
  }
}
