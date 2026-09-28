import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Writer has no dependency on authentication, so auth can audit its own events. */
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditWriterModule {}
