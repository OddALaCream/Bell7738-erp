import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { RequirePermissions } from '../rbac/require-permissions.decorator.js';
import { InvitationsService } from './invitations.service.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { ListInvitationsDto } from './dto/list-invitations.dto.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';

@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions('USERS_CREATE')
  @HttpCode(HttpStatus.OK)
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    // The response carries a one-time bearer secret (manualLink) — never cacheable.
    res.setHeader('Cache-Control', 'no-store');
    return this.invitations.create(dto, actor);
  }

  @Get()
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions('USERS_VIEW')
  list(@Query() query: ListInvitationsDto) {
    return this.invitations.list(query);
  }

  @Post(':invitationId/resend')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions('USERS_CREATE')
  @HttpCode(HttpStatus.OK)
  resend(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.invitations.resend(invitationId);
  }

  @Post(':invitationId/revoke')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions('USERS_CREATE')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(invitationId);
  }

  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(@Body() dto: AcceptInvitationDto): Promise<void> {
    return this.invitations.accept(dto);
  }
}
