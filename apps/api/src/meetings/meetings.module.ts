import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ProjectAccessModule } from '../projects/project-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingRemindersService } from './meeting-reminders.service.js';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    ProjectAccessModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingRemindersService],
})
export class MeetingsModule {}
