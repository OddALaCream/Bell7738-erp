import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { DocumentsService } from './documents.service.js';
import { DocumentUploadInterceptor } from './document-upload.interceptor.js';
import { ListDocumentsDto } from './dto/list-documents.dto.js';
import { buildContentDisposition } from './content-disposition.js';

@Controller({ version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('projects/:projectId/documents')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListDocumentsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documents.list(projectId, query, actor);
  }

  @Post('projects/:projectId/documents')
  @RequirePermissions('DOCUMENTS_UPLOAD')
  @UseInterceptors(DocumentUploadInterceptor)
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documents.create(projectId, file, actor);
  }

  @Get('projects/:projectId/documents/:documentId')
  getById(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documents.getById(projectId, documentId, actor);
  }

  // docs/SECURITY.md: streams the file directly, never a redirect to a local
  // path or external URL, with a safe Content-Disposition and nosniff.
  @Get('projects/:projectId/documents/:documentId/download')
  async download(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, originalName, mimeType } = await this.documents.download(
      projectId,
      documentId,
      actor,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: buildContentDisposition(originalName),
    });
  }

  @Delete('projects/:projectId/documents/:documentId')
  @RequirePermissions('DOCUMENTS_DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.documents.delete(projectId, documentId, actor);
  }
}
