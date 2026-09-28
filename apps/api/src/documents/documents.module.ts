import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentUploadInterceptor } from './document-upload.interceptor.js';

@Module({
  imports: [AuthModule, RbacModule, ProjectsModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentUploadInterceptor],
})
export class DocumentsModule {}
