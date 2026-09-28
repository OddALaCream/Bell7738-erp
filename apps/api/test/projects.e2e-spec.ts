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
describe('Projects & project membership (e2e)', () => {
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
    await prisma.projectMember.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    // ActivityEvent.projectId is a real FK (onDelete: Restrict) — project
    // create/update/delete and member add/role-change/remove now record activity.
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

  describe('POST /projects', () => {
    it('rejects a user without PROJECTS_CREATE', async () => {
      const user = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(user.email);
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should fail', status: 'PLANNED' })
        .expect(403);
    });

    it('rejects PROJECTS_CREATE without PROJECTS_VIEW_ASSIGNED or PROJECTS_VIEW_ALL', async () => {
      const user = await createUserWithPermissions(['PROJECTS_CREATE']);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should fail', status: 'PLANNED' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('creates a project and adds the creator as MANAGER', async () => {
      const user = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: `Project-${randomUUID()}`, status: 'PLANNED' })
        .expect(201);
      createdProjectIds.push(res.body.data.id);

      const membership = await prisma.projectMember.findFirst({
        where: { projectId: res.body.data.id, userId: user.id },
      });
      expect(membership?.role).toBe('MANAGER');
    });

    it('rejects an expectedEndDate before startDate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: `Project-${randomUUID()}`,
          startDate: '2026-06-10',
          expectedEndDate: '2026-06-01',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Visibility', () => {
    it('404s for a nonexistent project regardless of actor', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${randomUUID()}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(404);
    });

    it('404s (not 403) for a plain user with no relevant permission, even knowing the UUID', async () => {
      const owner = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(owner.id);

      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('404s for a member of a different project even with PROJECTS_VIEW_ASSIGNED', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const otherProjectMember = await createUserWithPermissions([
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await createProjectDirect(otherProjectMember.id);
      const { accessToken } = await loginAs(otherProjectMember.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('allows PROJECTS_VIEW_ALL to read any project without membership, but not write to it', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const viewer = await createUserWithPermissions(['PROJECTS_VIEW_ALL']);
      const { accessToken } = await loginAs(viewer.email);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(getRes.body.data.viewerCapabilities).toEqual({
        role: null,
        canUpdate: false,
        canDelete: false,
        canManageMembers: false,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('allows the organizational override (PROJECTS_VIEW_ALL + PROJECTS_UPDATE) to edit any project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const admin = await createUserWithPermissions([
        'PROJECTS_VIEW_ALL',
        'PROJECTS_UPDATE',
      ]);
      const { accessToken } = await loginAs(admin.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Renamed by override' })
        .expect(200);
      expect(res.body.data.name).toBe('Renamed by override');
    });

    it('does not leak projects between actors in list results', async () => {
      const managerA = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const projectA = await createProjectDirect(managerA.id);
      const managerB = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await createProjectDirect(managerB.id);

      const { accessToken } = await loginAs(managerA.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(projectA.id);
      expect(ids.length).toBe(1);
    });
  });

  describe('Local project roles (VIEWER / MEMBER / MANAGER)', () => {
    it('denies PATCH to a VIEWER who holds the global PROJECTS_UPDATE permission but has no override', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const viewer = await createUserWithPermissions([
        'PROJECTS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, viewer.id, 'VIEWER');
      const { accessToken } = await loginAs(viewer.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should fail' })
        .expect(403);
    });

    it('denies PATCH to a plain MEMBER even with PROJECTS_UPDATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const member = await createUserWithPermissions([
        'PROJECTS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, member.id, 'MEMBER');
      const { accessToken } = await loginAs(member.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should fail' })
        .expect(403);
    });

    it('allows PATCH to the project MANAGER with PROJECTS_UPDATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECTS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Renamed by manager' })
        .expect(200);
      expect(res.body.data.name).toBe('Renamed by manager');
    });
  });

  describe('Status / completedAt coherence', () => {
    it('sets completedAt when moving to COMPLETED and clears it when moving away', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECTS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const completed = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(completed.body.data.completedAt).not.toBeNull();

      const reopened = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reopened.body.data.completedAt).toBeNull();
    });
  });

  describe('DELETE /projects/{projectId}', () => {
    it('logically deletes and hides the project from further reads', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECTS_DELETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      const row = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
      });
      expect(row.deletedAt).not.toBeNull();
    });
  });

  describe('Project members', () => {
    it('rejects adding a non-ACTIVE user as a member', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECT_MEMBERS_MANAGE',
      ]);
      const project = await createProjectDirect(manager.id);
      const invited = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          firstName: 'I',
          lastName: 'Nvited',
          status: 'INVITED',
        },
      });
      createdUserIds.push(invited.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: invited.id, role: 'MEMBER' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects adding a user who already has an active membership', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECT_MEMBERS_MANAGE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: manager.id, role: 'MEMBER' })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('adds, updates the role of, and soft-removes a member', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECT_MEMBERS_MANAGE',
      ]);
      const project = await createProjectDirect(manager.id);
      const teammate = await createActiveUser();
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: teammate.id, role: 'VIEWER' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/members/${teammate.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'MEMBER' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/members/${teammate.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const membership = await prisma.projectMember.findUniqueOrThrow({
        where: {
          projectId_userId: { projectId: project.id, userId: teammate.id },
        },
      });
      expect(membership.removedAt).not.toBeNull();
    });

    it('rejects removing or demoting the sole active manager', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECT_MEMBERS_MANAGE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const demote = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/members/${manager.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'MEMBER' })
        .expect(409);
      expect(demote.body.error.code).toBe('CONFLICT');

      const remove = await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/members/${manager.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
      expect(remove.body.error.code).toBe('CONFLICT');
    });

    it('allows demoting a manager once a second active manager exists', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'PROJECT_MEMBERS_MANAGE',
      ]);
      const project = await createProjectDirect(manager.id);
      const secondManager = await createActiveUser();
      await addMemberDirect(project.id, secondManager.id, 'MANAGER');
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/members/${manager.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'MEMBER' })
        .expect(200);
    });

    it('rejects a non-manager, non-override actor managing members', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const member = await createUserWithPermissions([
        'PROJECT_MEMBERS_MANAGE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, member.id, 'MEMBER');
      const { accessToken } = await loginAs(member.email);
      const teammate = await createActiveUser();

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: teammate.id, role: 'VIEWER' })
        .expect(403);
    });
  });
});
