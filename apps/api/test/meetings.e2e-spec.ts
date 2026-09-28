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
describe('Meetings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerAccessToken: string;

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
    return {
      accessToken: res.body.data.accessToken as string,
      cookie: res.headers['set-cookie']?.[0] as string,
    };
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

  async function createMeetingDirect(
    projectId: string,
    organizerId: string,
    participantIds: string[],
  ) {
    const allParticipants = [...new Set([organizerId, ...participantIds])];
    const meeting = await prisma.meeting.create({
      data: {
        projectId,
        title: `Meeting-${randomUUID()}`,
        startsAt: new Date('2026-01-01T10:00:00Z'),
        endsAt: new Date('2026-01-01T11:00:00Z'),
        organizerId,
        participants: {
          createMany: {
            data: allParticipants.map((userId) => ({
              userId,
              addedById: organizerId,
            })),
          },
        },
      },
    });
    return meeting;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const ownerEmail = process.env.OWNER_EMAIL!;
    const ownerPassword = process.env.OWNER_PASSWORD!;
    const login = await loginAs(ownerEmail, ownerPassword);
    ownerAccessToken = login.accessToken;
  });

  afterAll(async () => {
    // Notification.userId is onDelete: Restrict — must go before deleting
    // the users, now that meeting participation/updates create notifications.
    await prisma.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
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
    // ActivityEvent.projectId is a real FK (onDelete: Restrict) — meeting
    // create/update/notes/participants/delete calls now record activity.
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

  describe('POST /projects/{projectId}/meetings', () => {
    it('rejects a user without MEETINGS_CREATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
        })
        .expect(403);
    });

    it('rejects a VIEWER with MEETINGS_CREATE (needs MEMBER or MANAGER local role, or override)', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const viewer = await createUserWithPermissions([
        'MEETINGS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, viewer.id, 'VIEWER');
      const { accessToken } = await loginAs(viewer.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
        })
        .expect(403);
    });

    it('allows a MEMBER with MEETINGS_CREATE and always includes the organizer as a participant', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const member = await createUserWithPermissions([
        'MEETINGS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, member.id, 'MEMBER');
      const { accessToken } = await loginAs(member.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Sync',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
          participantIds: [],
        })
        .expect(201);
      expect(res.body.data.organizerId).toBe(member.id);
      expect(
        res.body.data.participants.map((p: { userId: string }) => p.userId),
      ).toEqual([member.id]);
    });

    it('rejects an endsAt at or before startsAt', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startsAt: '2026-01-01T11:00:00Z',
          endsAt: '2026-01-01T10:00:00Z',
        })
        .expect(400);
    });

    it('rejects a participant who is not a current member of the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const outsider = await createActiveUser();
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startsAt: '2026-01-01T10:00:00Z',
          endsAt: '2026-01-01T11:00:00Z',
          participantIds: [outsider.id],
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /projects/{projectId}/meetings/{meetingId}', () => {
    it('404s for a meeting belonging to a different project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const projectA = await createProjectDirect(manager.id);
      const projectB = await createProjectDirect(manager.id);
      const meeting = await createMeetingDirect(projectA.id, manager.id, []);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectB.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('404s for an actor with no visibility into the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const meeting = await createMeetingDirect(project.id, manager.id, []);
      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /projects/{projectId}/meetings/{meetingId}', () => {
    it('allows the organizer with MEETINGS_UPDATE even without a MANAGER role', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const organizer = await createUserWithPermissions([
        'MEETINGS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, organizer.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, organizer.id, []);
      const { accessToken } = await loginAs(organizer.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Renamed by organizer' })
        .expect(200);
      expect(res.body.data.title).toBe('Renamed by organizer');
    });

    it('rejects a plain participant (not the organizer) even with MEETINGS_UPDATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const participant = await createUserWithPermissions([
        'MEETINGS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, participant.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, manager.id, [
        participant.id,
      ]);
      const { accessToken } = await loginAs(participant.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Should fail' })
        .expect(403);
    });

    it('allows a MANAGER with MEETINGS_UPDATE even without being the organizer', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const someoneElse = await createActiveUser();
      await addMemberDirect(project.id, someoneElse.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, someoneElse.id, []);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Renamed by manager' })
        .expect(200);
    });
  });

  describe('PUT /projects/{projectId}/meetings/{meetingId}/participants', () => {
    it('rejects a non-organizer, non-manager actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const participant = await createUserWithPermissions([
        'MEETINGS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, participant.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, manager.id, [
        participant.id,
      ]);
      const { accessToken } = await loginAs(participant.email);

      await request(app.getHttpServer())
        .put(
          `/api/v1/projects/${project.id}/meetings/${meeting.id}/participants`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ participantIds: [] })
        .expect(403);
    });

    it('replaces participants but never drops the organizer, even if omitted', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const newParticipant = await createActiveUser();
      await addMemberDirect(project.id, newParticipant.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, manager.id, []);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .put(
          `/api/v1/projects/${project.id}/meetings/${meeting.id}/participants`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ participantIds: [newParticipant.id] })
        .expect(200);
      const participantIds = res.body.data.participants
        .map((p: { userId: string }) => p.userId)
        .sort();
      expect(participantIds).toEqual([manager.id, newParticipant.id].sort());
    });
  });

  describe('PATCH /projects/{projectId}/meetings/{meetingId}/notes', () => {
    it('rejects a non-participant, non-manager actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const outsiderMember = await createUserWithPermissions([
        'MEETINGS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, outsiderMember.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, manager.id, []);
      const { accessToken } = await loginAs(outsiderMember.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}/notes`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: { text: 'hi' }, expectedRevision: 1 })
        .expect(403);
    });

    it('allows a participant to update notes and increments the revision', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const participant = await createUserWithPermissions([
        'MEETINGS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, participant.id, 'MEMBER');
      const meeting = await createMeetingDirect(project.id, manager.id, [
        participant.id,
      ]);
      const { accessToken } = await loginAs(participant.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}/notes`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          notes: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
            ],
          },
          expectedRevision: 1,
        })
        .expect(200);
      expect(res.body.data.revision).toBe(2);
      expect(res.body.data.notes).toEqual({ text: 'hello' });
    });

    it('returns 409 REVISION_CONFLICT with the current revision on a stale expectedRevision', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const meeting = await createMeetingDirect(project.id, manager.id, []);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/meetings/${meeting.id}/notes`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: { type: 'doc' }, expectedRevision: 99 })
        .expect(409);
      expect(res.body.error.code).toBe('REVISION_CONFLICT');
      expect(res.body.error.currentRevision).toBe(1);
    });
  });

  describe('DELETE /projects/{projectId}/meetings/{meetingId}', () => {
    it('rejects a non-organizer, non-manager actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const organizer = await createUserWithPermissions([
        'MEETINGS_DELETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, organizer.id, 'MEMBER');
      // Organizer holds MEETINGS_DELETE but is only a MEMBER; another actor
      // (not the organizer, not a manager) must be rejected regardless.
      const meeting = await createMeetingDirect(project.id, manager.id, [
        organizer.id,
      ]);
      const { accessToken } = await loginAs(organizer.email);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('logically deletes and hides the meeting from further reads', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'MEETINGS_DELETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const meeting = await createMeetingDirect(project.id, manager.id, []);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /projects/{projectId}/meetings', () => {
    it('filters to upcoming vs. past meetings', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const pastMeeting = await prisma.meeting.create({
        data: {
          projectId: project.id,
          title: 'Past meeting',
          startsAt: new Date('2020-01-01T10:00:00Z'),
          endsAt: new Date('2020-01-01T11:00:00Z'),
          organizerId: manager.id,
          participants: {
            create: { userId: manager.id, addedById: manager.id },
          },
        },
      });
      const { accessToken } = await loginAs(manager.email);

      const upcomingRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/meetings`)
        .query({ view: 'upcoming' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        upcomingRes.body.data.map((m: { id: string }) => m.id),
      ).not.toContain(pastMeeting.id);

      const pastRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/meetings`)
        .query({ view: 'past' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(pastRes.body.data.map((m: { id: string }) => m.id)).toContain(
        pastMeeting.id,
      );
    });

    it('404s for an actor with no visibility into the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/meetings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  it('allows the Owner to create and manage a meeting in any project without membership', async () => {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
    ]);
    const project = await createProjectDirect(manager.id);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/meetings`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        title: 'Owner meeting',
        startsAt: '2026-01-01T10:00:00Z',
        endsAt: '2026-01-01T11:00:00Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/projects/${project.id}/meetings/${createRes.body.data.id}`,
      )
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(204);
  });
});
