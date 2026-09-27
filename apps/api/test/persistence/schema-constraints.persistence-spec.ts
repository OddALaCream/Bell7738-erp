import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Exercises constraints that live only in raw SQL appended to the migration
 * (see prisma/migrations/*_init/migration.sql) — the ones Prisma's schema
 * can't express and so can't be verified by TypeScript or `prisma validate`.
 * Requires a reachable PostgreSQL instance; run via
 * `pnpm --filter api test:persistence` after `docker compose ... up -d postgres`.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

async function createUser(
  overrides: Partial<Parameters<typeof prisma.user.create>[0]['data']> = {},
) {
  return prisma.user.create({
    data: {
      email: uniqueEmail('user'),
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
      passwordHash: 'hash',
      ...overrides,
    },
  });
}

const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
let fixtureUserId: string;
let fixtureProjectId: string;

beforeAll(async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  fixtureUserId = user.id;

  const project = await prisma.project.create({
    data: {
      name: `Fixture project ${randomUUID()}`,
      status: 'ACTIVE',
      createdById: fixtureUserId,
    },
  });
  fixtureProjectId = project.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: fixtureProjectId } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('User constraints', () => {
  it('allows only one Owner (partial unique index on isOwner)', async () => {
    const firstOwner = await createUser({ isOwner: true });
    createdUserIds.push(firstOwner.id);

    await expect(createUser({ isOwner: true })).rejects.toThrow(
      /users_single_owner_key/,
    );
  });

  it('requires the Owner to be ACTIVE', async () => {
    await expect(
      createUser({ isOwner: true, status: 'SUSPENDED' }),
    ).rejects.toThrow(/users_owner_active_check/);
  });

  it('requires ACTIVE users to have a password set', async () => {
    await expect(
      createUser({ status: 'ACTIVE', passwordHash: null }),
    ).rejects.toThrow(/users_active_has_password_check/);
  });

  it('allows INVITED users without a password', async () => {
    const invited = await createUser({ status: 'INVITED', passwordHash: null });
    createdUserIds.push(invited.id);
    expect(invited.passwordHash).toBeNull();
  });
});

describe('Role constraints', () => {
  it('treats role names as unique case-insensitively', async () => {
    const suffix = randomUUID();
    const first = await prisma.role.create({
      data: { name: `Admin-${suffix}`, color: '#336699', position: 1 },
    });
    createdRoleIds.push(first.id);

    await expect(
      prisma.role.create({
        data: { name: `admin-${suffix}`, color: '#336699', position: 2 },
      }),
    ).rejects.toThrow(/roles_name_lower_key/);
  });

  it('rejects a malformed hex color', async () => {
    await expect(
      prisma.role.create({
        data: { name: `Bad-color-${randomUUID()}`, color: 'blue', position: 1 },
      }),
    ).rejects.toThrow(/roles_color_format_check/);
  });
});

describe('Project constraints', () => {
  it('rejects an expectedEndDate before startDate', async () => {
    await expect(
      prisma.project.create({
        data: {
          name: `Bad range ${randomUUID()}`,
          status: 'PLANNED',
          startDate: new Date('2026-02-01'),
          expectedEndDate: new Date('2026-01-01'),
          createdById: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/projects_date_range_check/);
  });

  it('requires completedAt exactly when status is COMPLETED', async () => {
    await expect(
      prisma.project.create({
        data: {
          name: `Bad completion ${randomUUID()}`,
          status: 'COMPLETED',
          createdById: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/projects_completed_at_check/);
  });
});

describe('Task constraints', () => {
  it('rejects a dueDate before startDate', async () => {
    await expect(
      prisma.task.create({
        data: {
          projectId: fixtureProjectId,
          title: 'Bad range',
          status: 'PENDING',
          startDate: new Date('2026-02-01'),
          dueDate: new Date('2026-01-01'),
          createdById: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/tasks_date_range_check/);
  });

  it('requires completedAt exactly when status is DONE', async () => {
    await expect(
      prisma.task.create({
        data: {
          projectId: fixtureProjectId,
          title: 'Bad completion',
          status: 'DONE',
          startDate: new Date('2026-01-01'),
          dueDate: new Date('2026-01-02'),
          createdById: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/tasks_done_completed_at_check/);
  });
});

describe('Meeting constraints', () => {
  it('rejects endsAt before or equal to startsAt', async () => {
    await expect(
      prisma.meeting.create({
        data: {
          projectId: fixtureProjectId,
          title: 'Bad range',
          startsAt: new Date('2026-01-01T10:00:00Z'),
          endsAt: new Date('2026-01-01T09:00:00Z'),
          organizerId: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/meetings_time_range_check/);
  });
});

describe('Document constraints', () => {
  it('rejects a negative size', async () => {
    await expect(
      prisma.document.create({
        data: {
          projectId: fixtureProjectId,
          originalName: 'file.pdf',
          storageKey: randomUUID(),
          mimeType: 'application/pdf',
          size: -1n,
          uploadedById: fixtureUserId,
        },
      }),
    ).rejects.toThrow(/documents_size_non_negative_check/);
  });
});
