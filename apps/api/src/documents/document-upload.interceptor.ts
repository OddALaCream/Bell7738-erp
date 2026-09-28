import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { catchError, from, type Observable, switchMap, throwError } from 'rxjs';
import { AppConfigService } from '../config/app-config.service.js';
import { StorageService } from '../storage/storage.service.js';
import { extensionOf, isAllowedExtension } from '../storage/file-signatures.js';

/**
 * Runs multer directly (rather than the static `FileInterceptor(...)`
 * decorator) so the disk destination, size limit, and extension allowlist
 * all come from the validated AppConfigService instead of being frozen at
 * class-decoration time, before Nest's DI/env validation even runs.
 *
 * docs/SECURITY.md: the size limit is enforced by multer/busboy DURING the
 * incoming stream (disk storage writes chunks as they arrive; the upload is
 * aborted once the limit is exceeded), not after buffering the whole file.
 * The extension allowlist is checked before any bytes are written via
 * `fileFilter`; magic-byte verification against actual content happens
 * after the file lands, in DocumentsService (it needs real bytes). `fields`/
 * `parts` are capped at 0/1 since this form has exactly one part (the file)
 * — otherwise MAX_UPLOAD_BYTES would only bound the file itself, not
 * unlimited accompanying text fields multer buffers into `req.body`.
 */
@Injectable()
export class DocumentUploadInterceptor implements NestInterceptor {
  constructor(
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const allowedExtensions = this.config.storage.allowedExtensions;

    const upload = multer({
      storage: multer.diskStorage({
        destination: this.storage.uploadDestination,
        filename: (_req, _file, callback) =>
          callback(null, this.storage.generateStorageKey()),
      }),
      limits: {
        fileSize: this.config.storage.maxUploadBytes,
        files: 1,
        fields: 0,
        parts: 1,
      },
      fileFilter: (_req, file, callback) => {
        const extension = extensionOf(file.originalname);
        if (!isAllowedExtension(extension, allowedExtensions)) {
          callback(
            new UnsupportedMediaTypeException('This file type is not allowed.'),
          );
          return;
        }
        callback(null, true);
      },
    }).single('file');

    await new Promise<void>((resolveUpload, reject) => {
      upload(request, response, (error: unknown) => {
        if (!error) {
          resolveUpload();
          return;
        }
        if (
          error instanceof multer.MulterError &&
          error.code === 'LIMIT_FILE_SIZE'
        ) {
          reject(
            new PayloadTooLargeException(
              'File exceeds the maximum allowed size.',
            ),
          );
          return;
        }
        reject(error);
      });
    });

    // A file is now on disk. If anything downstream fails — a route param
    // pipe (e.g. an invalid :projectId UUID rejected before any handler or
    // service code runs), another DTO validation pipe, or the handler
    // itself — that file would otherwise never be cleaned up, since
    // DocumentsService.create() never gets a chance to run its own cleanup.
    // This is a safety net independent of (and redundant with, safely so:
    // deleteIfExists is idempotent) the service's own try/catch.
    return next.handle().pipe(
      catchError((error: unknown) => {
        const file = request.file;
        if (!file) return throwError(() => error);
        // Awaited (not fire-and-forget): the response must not go out until
        // cleanup has actually completed.
        return from(this.storage.deleteIfExists(file.filename)).pipe(
          switchMap(() => throwError(() => error)),
        );
      }),
    );
  }
}
