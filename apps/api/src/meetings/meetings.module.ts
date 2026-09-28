import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';

@Module({
  imports: [AuthModule, RbacModule, ProjectsModule, NotificationsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
