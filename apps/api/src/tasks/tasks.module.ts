import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ProjectAccessModule } from '../projects/project-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    ProjectAccessModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
