import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { AuditWriterModule } from '../audit/audit-writer.module.js';

@Module({
  imports: [JwtModule.register({}), AuditWriterModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TokenService,
    SessionAuthGuard,
  ],
  exports: [SessionAuthGuard, SessionService, TokenService],
})
export class AuthModule {}
