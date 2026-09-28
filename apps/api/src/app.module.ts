import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    InvitationsModule,
    ProjectsModule,
    TasksModule,
    MeetingsModule,
    DocumentsModule,
    NotificationsModule,
    ActivityModule,
    AuditModule,
    // docs/SECURITY.md: baseline rate limiting; login/refresh set tighter
    // per-route limits via @Throttle.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
