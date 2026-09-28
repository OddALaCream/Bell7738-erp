import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Requires a reachable PostgreSQL instance (see docker-compose.dev.yml) with
 * the permission catalog seeded (`pnpm --filter api seed`) and the Owner
 * bootstrapped. Not part of `pnpm test`; run via `pnpm --filter api test:e2e`.
 */
describe('Activity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'a-plain-user-password-123';
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function createActiveUser() {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: 'Test',
        lastName: 'User',
        status: 'ACTIVE',
        passwordHash,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function loginAs(email: string, pw = password) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: pw })
      .expect(200);
    return { accessToken: res.body.data.accessToken as string };
  }

  async function createUserWithPermissions(keys: string[]) {
    const user = await createActiveUser();
    if (keys.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { key: { in: keys } },
      });
      const role = await prisma.role.create({
        data: {
          name: `Role-${randomUUID()}`,
          color: '#336699',
          position: 1,
          rolePermissions: {
            createMany: {
              data: permissions.map((p) => ({ permissionId: p.id })),
            },
          },
        },
      });
      createdRoleIds.push(role.id);
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
    return user;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.taskAssignee.deleteMany({
      where: { task: { projectId: { in: createdProjectIds } } },
    });
    await prisma.task.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.projectMember.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.activityEvent.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await app.close();
  });

  it('records PROJECT_CREATED and TASK_CREATED activity, listable by a project member', async () => {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
      'TASKS_CREATE',
    ]);
    const { accessToken } = await loginAs(manager.email);

    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Project-${randomUUID()}`, status: 'PLANNED' })
      .expect(201);
    const projectId = projectRes.body.data.id as string;
    createdProjectIds.push(projectId);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Do the thing',
        startDate: '2026-01-01',
        dueDate: '2026-01-10',
        assigneeIds: [manager.id],
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/activity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const types = listRes.body.data.map(
      (event: { type: string }) => event.type,
    );
    expect(types).toContain('PROJECT_CREATED');
    expect(types).toContain('TASK_CREATED');
    expect(
      listRes.body.data.every(
        (event: { projectId: string }) => event.projectId === projectId,
      ),
    ).toBe(true);
  });

  it('filters by type', async () => {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
      'TASKS_CREATE',
    ]);
    const { accessToken } = await loginAs(manager.email);

    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Project-${randomUUID()}`, status: 'PLANNED' })
      .expect(201);
    const projectId = projectRes.body.data.id as string;
    createdProjectIds.push(projectId);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Filtered task',
        startDate: '2026-01-01',
        dueDate: '2026-01-10',
        assigneeIds: [manager.id],
      })
      .expect(201);

    const filteredRes = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/activity`)
      .query({ type: 'TASK_CREATED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      filteredRes.body.data.every(
        (event: { type: string }) => event.type === 'TASK_CREATED',
      ),
    ).toBe(true);
    expect(filteredRes.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('404s for a user with no visibility into the project', async () => {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
    ]);
    const { accessToken: managerToken } = await loginAs(manager.email);
    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Project-${randomUUID()}`, status: 'PLANNED' })
      .expect(201);
    const projectId = projectRes.body.data.id as string;
    createdProjectIds.push(projectId);

    const outsider = await createUserWithPermissions([]);
    const { accessToken: outsiderToken } = await loginAs(outsider.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/activity`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
