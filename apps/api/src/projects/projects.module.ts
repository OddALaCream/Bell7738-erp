import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { AuditWriterModule } from '../audit/audit-writer.module.js';
import { ProjectAccessModule } from './project-access.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ProjectMembersController } from './project-members.controller.js';
import { ProjectMembersService } from './project-members.service.js';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    ProjectAccessModule,
    ActivityModule,
    AuditWriterModule,
  ],
  controllers: [ProjectsController, ProjectMembersController],
  providers: [ProjectsService, ProjectMembersService],
  // Re-exports the imported ProjectAccessModule (not just the service class)
  // for Tasks/Meetings/Documents, which historically imported ProjectsModule
  // for ProjectAccessService — Nest can only re-export a module it imports,
  // not name a provider class it doesn't itself declare.
  exports: [ProjectAccessModule],
})
export class ProjectsModule {}
