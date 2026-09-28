import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PasswordService } from '../src/auth/password.service.js';
import { StorageService } from '../src/storage/storage.service.js';

describe('Backend security regressions (HTTP + PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actorId: string;
  let actorEmail: string;
  let token: string;
  let ownerToken: string;
  let projectId: string;
  let taskId: string;
  let meetingId: string;
  const users: string[] = [];
  const roles: string[] = [];
  const password = 'qa-critical-passphrase-123';

  async function login(email: string, plainPassword = password) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: plainPassword })
      .expect(200);
    return {
      token: res.body.data.accessToken as string,
      cookie: res.headers['set-cookie'][0] as string,
    };
  }
  async function user() {
    const created = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: 'QA',
        lastName: 'Regression',
        status: 'ACTIVE',
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    users.push(created.id);
    return created;
  }
  async function role(keys: string[]) {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    const created = await prisma.role.create({
      data: {
        name: `QA-${randomUUID()}`,
        color: '#336699',
        position: 1,
        rolePermissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    roles.push(created.id);
    return created;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ownerToken = (
      await login(process.env.OWNER_EMAIL!, process.env.OWNER_PASSWORD!)
    ).token;
    const actor = await user();
    actorId = actor.id;
    actorEmail = actor.email;
    const actorRole = await role([
      'PROJECTS_VIEW_ASSIGNED',
      'TASKS_UPDATE',
      'TASKS_COMPLETE',
      'MEETINGS_UPDATE',
      'DOCUMENTS_UPLOAD',
      'DOCUMENTS_DELETE',
      'USERS_CREATE',
      'USERS_DISABLE',
    ]);
    await prisma.userRole.create({
      data: { userId: actorId, roleId: actorRole.id },
    });
    token = (await login(actorEmail)).token;
    const project = await prisma.project.create({
      data: {
        name: 'Security regression',
        status: 'ACTIVE',
        createdById: actorId,
        members: {
          create: { userId: actorId, role: 'MEMBER', addedById: actorId },
        },
      },
    });
    projectId = project.id;
    const task = await prisma.task.create({
      data: {
        projectId,
        title: 'Historical creator',
        startDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-02'),
        status: 'PENDING',
        createdById: actorId,
        assignees: { create: { userId: actorId, assignedById: actorId } },
      },
    });
    taskId = task.id;
    const meeting = await prisma.meeting.create({
      data: {
        projectId,
        title: 'Historical participant',
        startsAt: new Date('2026-01-01T10:00:00Z'),
        endsAt: new Date('2026-01-01T11:00:00Z'),
        organizerId: actorId,
        participants: { create: { userId: actorId, addedById: actorId } },
      },
    });
    meetingId = meeting.id;
  });
  afterAll(async () => {
    if (projectId) {
      const docs = await prisma.document.findMany({
        where: { projectId },
        select: { storageKey: true },
      });
      for (const doc of docs)
        await app.get(StorageService).deleteIfExists(doc.storageKey);
      await prisma.document.deleteMany({ where: { projectId } });
      await prisma.notification.deleteMany({ where: { projectId } });
      await prisma.meetingReminder.deleteMany({
        where: { meeting: { projectId } },
      });
      await prisma.meetingParticipant.deleteMany({
        where: { meeting: { projectId } },
      });
      await prisma.meeting.deleteMany({ where: { projectId } });
      await prisma.taskAssignee.deleteMany({ where: { task: { projectId } } });
      await prisma.task.deleteMany({ where: { projectId } });
      await prisma.activityEvent.deleteMany({ where: { projectId } });
      await prisma.projectMember.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    await prisma.invitationRole.deleteMany({
      where: { invitation: { userId: { in: users } } },
    });
    await prisma.invitation.deleteMany({ where: { userId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roles } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roles } } });
    await app.close();
  });

  it('protects self-status even when the UUID is uppercase', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/users/${actorId.toUpperCase()}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: actorId } })).status,
    ).toBe('ACTIVE');
  });
  it('requires a file and maps extra multipart fields to 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('extra', 'invalid')
      .attach('file', Buffer.from('%PDF-1.7\n'), 'file.pdf')
      .expect(400);
    expect(await prisma.document.count({ where: { projectId } })).toBe(0);
  });
  it('denies all historical relationship writes after demotion to VIEWER', async () => {
    const doc = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), 'file.pdf')
      .expect(201);
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: actorId } },
      data: { role: 'VIEWER' },
    });
    try {
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Unauthorized' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Unauthorized' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectId}/meetings/${meetingId}/notes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: { type: 'doc' }, expectedRevision: 1 })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${projectId}/documents/${doc.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    } finally {
      await prisma.projectMember.update({
        where: { projectId_userId: { projectId, userId: actorId } },
        data: { role: 'MEMBER' },
      });
    }
  });
  it('removes historical assignments from My Schedule after membership removal', async () => {
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: actorId } },
      data: { removedAt: new Date() },
    });
    try {
      const schedule = await request(app.getHttpServer())
        .get('/api/v1/me/schedule')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(schedule.body.data).toEqual([]);
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/calendar`)
        .query({ from: '2026-01-01', to: '2026-01-02' })
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    } finally {
      await prisma.projectMember.update({
        where: { projectId_userId: { projectId, userId: actorId } },
        data: { removedAt: null },
      });
    }
  });
  it('rejects impossible calendar dates', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/calendar`)
      .query({ from: '2026-02-30', to: '2026-03-03' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
  it('prevents an inviter from reviving a privileged invitation they cannot grant', async () => {
    const privileged = await role(['AUDIT_VIEW']);
    const create = await request(app.getHttpServer())
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: `${randomUUID()}@example.test`,
        firstName: 'Invited',
        lastName: 'Admin',
        roleIds: [privileged.id],
      })
      .expect(200);
    users.push(
      create.body.data.userId ??
        (
          await prisma.invitation.findUniqueOrThrow({
            where: { id: create.body.data.id },
          })
        ).userId,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${create.body.data.id}/revoke`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const before = await prisma.invitation.findUniqueOrThrow({
      where: { id: create.body.data.id },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${before.id}/resend`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    const after = await prisma.invitation.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.tokenHash).toBe(before.tokenHash);
    expect(after.revokedAt).toEqual(before.revokedAt);
  });
  it('suspension invalidates access immediately and reactivation does not restore sessions', async () => {
    const target = await user();
    const credentials = await login(target.email);
    await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${credentials.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${credentials.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', credentials.cookie)
      .expect(401);
    await login(target.email);
  });
  it('persists redacted login and session revocation audit events', async () => {
    const target = await user();
    const credentials = await login(target.email);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${credentials.token}`)
      .expect(204);
    const entries = await prisma.auditLog.findMany({
      where: { actorId: target.id },
    });
    expect(entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGOUT_ALL']),
    );
    expect(JSON.stringify(entries)).not.toContain(credentials.token);
    expect(JSON.stringify(entries)).not.toContain(password);
  });
});
