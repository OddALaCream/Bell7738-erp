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
describe('Notifications (e2e)', () => {
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

  async function createProjectDirect(managerId: string) {
    const project = await prisma.project.create({
      data: {
        name: `Project-${randomUUID()}`,
        status: 'ACTIVE',
        createdById: managerId,
      },
    });
    createdProjectIds.push(project.id);
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: managerId,
        role: 'MANAGER',
        addedById: managerId,
      },
    });
    return project;
  }

  async function addMemberDirect(
    projectId: string,
    userId: string,
    role: 'MANAGER' | 'MEMBER' | 'VIEWER',
  ) {
    await prisma.projectMember.create({
      data: { projectId, userId, role, addedById: userId },
    });
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
    await prisma.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
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
    // ActivityEvent.projectId is a real FK (onDelete: Restrict) — the task/
    // meeting mutations above now record activity alongside notifications.
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

  describe('Task assignment triggers TASK_ASSIGNED', () => {
    it('notifies a newly-assigned user but not the actor who assigned them', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createActiveUser();
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Do the thing',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [assignee.id],
        })
        .expect(201);

      const notification = await prisma.notification.findFirst({
        where: { userId: assignee.id, type: 'TASK_ASSIGNED' },
      });
      expect(notification).not.toBeNull();
      expect(notification?.actorId).toBe(manager.id);
      expect(notification?.projectId).toBe(project.id);

      const managerNotification = await prisma.notification.findFirst({
        where: { userId: manager.id, type: 'TASK_ASSIGNED' },
      });
      expect(managerNotification).toBeNull();
    });
  });

  describe('Meeting participation triggers MEETING_ADDED / MEETING_UPDATED', () => {
    it('notifies an invited participant on meeting creation', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const participant = await createActiveUser();
      await addMemberDirect(project.id, participant.id, 'MEMBER');
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Kickoff',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
          participantIds: [participant.id],
        })
        .expect(201);

      const notification = await prisma.notification.findFirst({
        where: {
          userId: participant.id,
          type: 'MEETING_ADDED',
          meetingId: res.body.data.id,
        },
      });
      expect(notification).not.toBeNull();
      expect(notification?.actorId).toBe(manager.id);
    });

    it('notifies participants when the schedule significantly changes, but not for a description-only edit', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_CREATE',
        'MEETINGS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const participant = await createActiveUser();
      await addMemberDirect(project.id, participant.id, 'MEMBER');
      const { accessToken } = await loginAs(manager.email);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Kickoff',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
          participantIds: [participant.id],
        })
        .expect(201);
      const meetingId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Just adding some notes, same schedule' })
        .expect(200);
      const afterDescriptionEdit = await prisma.notification.count({
        where: { userId: participant.id, type: 'MEETING_UPDATED', meetingId },
      });
      expect(afterDescriptionEdit).toBe(0);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          startsAt: '2026-01-01T14:00:00Z',
          endsAt: '2026-01-01T15:00:00Z',
        })
        .expect(200);
      const afterScheduleChange = await prisma.notification.findFirst({
        where: { userId: participant.id, type: 'MEETING_UPDATED', meetingId },
      });
      expect(afterScheduleChange).not.toBeNull();
    });
  });

  describe('GET /notifications, unread-count, read, read-all', () => {
    it("lists only the caller's own notifications and supports the read filter", async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createActiveUser();
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const { accessToken: managerToken } = await loginAs(manager.email);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Task for notif test',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [assignee.id],
        })
        .expect(201);

      const { accessToken } = await loginAs(assignee.email);
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body.data.every((n: { type: string }) => n.type)).toBe(
        true,
      );

      const unreadRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .query({ read: 'false' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(unreadRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Manager (a different user) sees none of the assignee's notifications.
      const managerListRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(
        managerListRes.body.data.map((n: { id: string }) => n.id),
      ).not.toEqual(
        expect.arrayContaining(
          listRes.body.data.map((n: { id: string }) => n.id),
        ),
      );
    });

    it('unread-count, mark-read (idempotent), and mark-all-read', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createActiveUser();
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const { accessToken: managerToken } = await loginAs(manager.email);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Another task',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [assignee.id],
        })
        .expect(201);

      const { accessToken } = await loginAs(assignee.email);
      const before = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(before.body.data.count).toBeGreaterThanOrEqual(1);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const notificationId = listRes.body.data[0].id;

      await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      // Idempotent: a second call still succeeds.
      await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(after.body.data.count).toBe(0);
    });

    it('404s marking as read a notification that does not belong to the caller', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createActiveUser();
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const { accessToken: managerToken } = await loginAs(manager.email);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Yet another task',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [assignee.id],
        })
        .expect(201);

      const { accessToken: assigneeToken } = await loginAs(assignee.email);
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${assigneeToken}`)
        .expect(200);
      const notificationId = listRes.body.data[0].id;

      const outsider = await createActiveUser();
      const { accessToken: outsiderToken } = await loginAs(outsider.email);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
