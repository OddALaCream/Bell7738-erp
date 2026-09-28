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
describe('Schedule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'a-plain-user-password-123';
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdRoleIds: string[] = [];

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
    await prisma.meetingParticipant.deleteMany({
      where: { meeting: { projectId: { in: createdProjectIds } } },
    });
    await prisma.meeting.deleteMany({
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
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function setUpProjectWithTaskAndMeeting() {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
      'TASKS_CREATE',
      'MEETINGS_CREATE',
    ]);
    const { accessToken } = await loginAs(manager.email);

    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Project-${randomUUID()}`, status: 'ACTIVE' })
      .expect(201);
    const projectId = projectRes.body.data.id as string;
    createdProjectIds.push(projectId);

    const taskRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Scheduled task',
        startDate: '2026-03-01',
        dueDate: '2026-03-05',
        assigneeIds: [manager.id],
      })
      .expect(201);

    const meetingRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/meetings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Scheduled meeting',
        startsAt: '2026-03-03T10:00:00Z',
        endsAt: '2026-03-03T11:00:00Z',
        participantIds: [manager.id],
      })
      .expect(201);

    return {
      manager,
      accessToken,
      projectId,
      taskId: taskRes.body.data.id as string,
      meetingId: meetingRes.body.data.id as string,
    };
  }

  describe('GET /projects/:projectId/timeline', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${randomUUID()}/timeline`)
        .expect(401);
    });

    it("returns the project's tasks with range/status/assignee filters", async () => {
      const { accessToken, projectId, taskId } =
        await setUpProjectWithTaskAndMeeting();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.map((t: { id: string }) => t.id)).toContain(taskId);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          startDate: '2026-03-01',
          dueDate: '2026-03-05',
        }),
      );

      const assignedInRange = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .query({
          assigneeId: (
            await prisma.task.findUniqueOrThrow({
              where: { id: taskId },
              select: { createdById: true },
            })
          ).createdById,
          from: '2026-03-03',
          to: '2026-03-03',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        assignedInRange.body.data.map((task: { id: string }) => task.id),
      ).toContain(taskId);

      const filtered = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .query({ status: 'DONE' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(filtered.body.data).toEqual([]);

      const outsideRange = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .query({ from: '2026-03-06' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(outsideRange.body.data).toEqual([]);
    });

    it('paginates deterministically and keeps DONE tasks visible', async () => {
      const { manager, accessToken, projectId, taskId } =
        await setUpProjectWithTaskAndMeeting();
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completedAt: new Date() },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Second scheduled task',
          startDate: '2026-03-02',
          dueDate: '2026-03-06',
          assigneeIds: [manager.id],
        })
        .expect(201);

      const page = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .query({ page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(page.body.meta).toEqual({
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      });
      expect(page.body.data).toHaveLength(1);

      const done = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .query({ status: 'DONE' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(done.body.data.map((task: { id: string }) => task.id)).toEqual([
        taskId,
      ]);
    });

    it('404s for a user with no visibility into the project', async () => {
      const { projectId } = await setUpProjectWithTaskAndMeeting();
      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/timeline`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /projects/:projectId/calendar', () => {
    it("combines the project's tasks and meetings into a discriminated union within range", async () => {
      const { accessToken, projectId, taskId, meetingId } =
        await setUpProjectWithTaskAndMeeting();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/calendar`)
        .query({ from: '2026-03-01', to: '2026-03-10' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const kinds = res.body.data.reduce(
        (acc: Record<string, string>, item: { kind: string; id: string }) => {
          acc[item.id] = item.kind;
          return acc;
        },
        {},
      );
      expect(kinds[taskId]).toBe('task');
      expect(kinds[meetingId]).toBe('meeting');
      expect(
        res.body.data.find((item: { id: string }) => item.id === taskId),
      ).toEqual(
        expect.objectContaining({ start: '2026-03-01', end: '2026-03-05' }),
      );
      expect(
        res.body.data.find((item: { id: string }) => item.id === meetingId),
      ).toEqual(
        expect.objectContaining({
          start: '2026-03-03T10:00:00.000Z',
          end: '2026-03-03T11:00:00.000Z',
        }),
      );
    });

    it('rejects a range exceeding the configured maximum', async () => {
      const { accessToken, projectId } = await setUpProjectWithTaskAndMeeting();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/calendar`)
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires from and to', async () => {
      const { accessToken, projectId } = await setUpProjectWithTaskAndMeeting();
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('excludes soft-deleted tasks and meetings', async () => {
      const { accessToken, projectId, taskId, meetingId } =
        await setUpProjectWithTaskAndMeeting();
      await prisma.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
      });
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { deletedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/calendar`)
        .query({ from: '2026-03-01', to: '2026-03-10' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /me/schedule', () => {
    it("combines only the caller's own assigned tasks and participated meetings", async () => {
      const { manager, accessToken, taskId, meetingId } =
        await setUpProjectWithTaskAndMeeting();
      void manager;

      const res = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = res.body.data.map((item: { id: string }) => item.id);
      expect(ids).toContain(taskId);
      expect(ids).toContain(meetingId);
    });

    it('keeps assigned DONE tasks visible', async () => {
      const { accessToken, taskId } = await setUpProjectWithTaskAndMeeting();
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({ kind: 'task' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ id: taskId, status: 'DONE' }),
      ]);
    });

    it('excludes items the caller is not assigned to or participating in', async () => {
      await setUpProjectWithTaskAndMeeting();
      const bystander = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(bystander.email);

      const res = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('filters by kind', async () => {
      const { accessToken, taskId, meetingId } =
        await setUpProjectWithTaskAndMeeting();

      const tasksOnly = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({ kind: 'task' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const taskOnlyIds = tasksOnly.body.data.map(
        (item: { id: string }) => item.id,
      );
      expect(taskOnlyIds).toContain(taskId);
      expect(taskOnlyIds).not.toContain(meetingId);
    });

    it('applies project, range, status, and pagination filters', async () => {
      const { accessToken, projectId, taskId } =
        await setUpProjectWithTaskAndMeeting();

      const matching = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({
          kind: 'task',
          projectId,
          status: 'PENDING',
          from: '2026-03-02',
          to: '2026-03-04',
          page: 1,
          pageSize: 1,
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(matching.body.data.map((item: { id: string }) => item.id)).toEqual(
        [taskId],
      );
      expect(matching.body.meta).toEqual({
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      });

      const outsideRange = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({ kind: 'task', projectId, from: '2026-03-06' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(outsideRange.body.data).toEqual([]);
    });

    it('does not leak historical assignments after project membership is removed', async () => {
      const { manager, accessToken, projectId } =
        await setUpProjectWithTaskAndMeeting();
      await prisma.projectMember.update({
        where: { projectId_userId: { projectId, userId: manager.id } },
        data: { removedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('rejects inverted ranges and non-calendar date values', async () => {
      const { accessToken } = await setUpProjectWithTaskAndMeeting();
      await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({ from: '2026-03-10', to: '2026-03-01' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .query({ from: '2026-03-01T00:00:00Z' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });
});
