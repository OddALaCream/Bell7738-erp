import { access, constants } from 'node:fs/promises';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';

type CheckResult = 'ok' | 'error';

@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{
    status: 'ok';
    checks: Record<string, CheckResult>;
  }> {
    const [database, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
    ]);
    const checks: Record<string, CheckResult> = { database, storage };

    if (database !== 'ok' || storage !== 'ok') {
      throw new HttpException(
        { status: 'error', checks },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', checks };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkStorage(): Promise<CheckResult> {
    try {
      await access(this.config.storage.root, constants.R_OK | constants.W_OK);
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
