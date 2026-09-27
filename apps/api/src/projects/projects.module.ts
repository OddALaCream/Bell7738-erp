import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ProjectMembersController } from './project-members.controller.js';
import { ProjectMembersService } from './project-members.service.js';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ProjectsController, ProjectMembersController],
  providers: [ProjectAccessService, ProjectsService, ProjectMembersService],
  // ProjectAccessService is reused by Tasks/Meetings/Documents in later phases.
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
