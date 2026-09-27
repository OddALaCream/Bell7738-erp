import { tmpdir } from 'node:os';
import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfigService } from '../config/app-config.service.js';

function makeController(overrides?: {
  queryRawShouldFail?: boolean;
  storageRoot?: string;
}) {
  const prisma = {
    $queryRaw: overrides?.queryRawShouldFail
      ? vi.fn().mockRejectedValue(new Error('connection refused'))
      : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  } as unknown as PrismaService;

  const config = {
    storage: { root: overrides?.storageRoot ?? tmpdir() },
  } as unknown as AppConfigService;

  return new HealthController(prisma, config);
}

describe('HealthController', () => {
  it('live() returns ok without checking dependencies', () => {
    const controller = makeController();
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('ready() returns ok when database and storage are reachable', async () => {
    const controller = makeController();
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'ok', storage: 'ok' },
    });
  });

  it('ready() throws 503 when the database check fails', async () => {
    const controller = makeController({ queryRawShouldFail: true });
    await expect(controller.ready()).rejects.toBeInstanceOf(HttpException);
  });

  it('ready() throws 503 when the storage path is not accessible', async () => {
    const controller = makeController({
      storageRoot: '/definitely/not/a/real/path',
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(HttpException);
  });
});
