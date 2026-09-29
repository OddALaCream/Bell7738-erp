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
 * Contracts the frontend depends on: /auth/me (roles + effective permissions),
 * real profile data with observer-scoped visibility, role badges on the team
 * and admin lists, and the cross-project activity feed. Requires a reachable
 * PostgreSQL with the permission catalog seeded and the Owner bootstrapped.
 * Not part of `pnpm test`; run via `pnpm --filter api test:e2e`.
 */
describe('Integration contracts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;

  const password = 'a-plain-user-password-123';
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function createUser(
    overrides: { status?: 'ACTIVE' | 'SUSPENDED'; firstName?: string } = {},
  ) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: overrides.firstName ?? 'Test',
        lastName: 'User',
        status: overrides.status ?? 'ACTIVE',
        passwordHash,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function grant(userId: string, keys: string[], name?: string) {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    const role = await prisma.role.create({
      data: {
        name: name ?? `Role-${randomUUID()}`,
        color: '#336699',
        position: 5,
        rolePermissions: {
          createMany: {
            data: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
      },
    });
    createdRoleIds.push(role.id);
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    return role;
  }

  async function userWith(keys: string[], roleName?: string) {
    const user = await createUser();
    const role = keys.length > 0 ? await grant(user.id, keys, roleName) : null;
    return { user, role };
  }

  async function loginAs(email: string, pw = password) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: pw })
      .expect(200);
    return {
      token: res.body.data.accessToken as string,
      loginUser: res.body.data.user,
    };
  }

  async function createProject(name: string, memberIds: string[]) {
    const project = await prisma.project.create({
      data: {
        name,
        status: 'ACTIVE',
        createdById: memberIds[0]!,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: 'MANAGER' as const,
            addedById: memberIds[0]!,
          })),
        },
      },
    });
    createdProjectIds.push(project.id);
    return project;
  }

  async function createTask(
    projectId: string,
    userId: string,
    title: string,
    done = false,
  ) {
    return prisma.task.create({
      data: {
        projectId,
        title,
        startDate: new Date('2026-03-01'),
        dueDate: new Date('2026-03-05'),
        status: done ? 'DONE' : 'IN_PROGRESS',
        completedAt: done ? new Date() : null,
        createdById: userId,
        assignees: { create: { userId, assignedById: userId } },
      },
    });
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ownerToken = (
      await loginAs(process.env.OWNER_EMAIL!, process.env.OWNER_PASSWORD!)
    ).token;
  });

  afterAll(async () => {
    const byProject = { task: { projectId: { in: createdProjectIds } } };
    await prisma.taskAssignee.deleteMany({ where: byProject });
    await prisma.task.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.activityEvent.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.projectMember.deleteMany({
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

  describe('GET /auth/me', () => {
    it('returns roles and the union of effective permissions for a non-Owner administrator', async () => {
      const { user, role } = await userWith(['USERS_VIEW', 'AUDIT_VIEW']);
      const second = await grant(user.id, ['ROLES_VIEW', 'USERS_VIEW']);
      const { token } = await loginAs(user.email);

      const res = await get('/auth/me', token).expect(200);
      expect(res.body.data).toMatchObject({
        id: user.id,
        isOwner: false,
        permissions: ['AUDIT_VIEW', 'ROLES_VIEW', 'USERS_VIEW'],
      });
      expect(
        res.body.data.roles.map((r: { id: string }) => r.id).sort(),
      ).toEqual([role!.id, second.id].sort());
      expect(res.body.data.capabilities.uploads.maxBytes).toBeGreaterThan(0);
      expect(res.body.data.capabilities.uploads.allowedExtensions).toContain(
        'pdf',
      );
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('returns no permissions for a user without roles — nothing is implied', async () => {
      const { user } = await userWith([]);
      const { token } = await loginAs(user.email);
      const res = await get('/auth/me', token).expect(200);
      expect(res.body.data.roles).toEqual([]);
      expect(res.body.data.permissions).toEqual([]);
    });

    it('returns the full catalog for the Owner', async () => {
      const catalog = await prisma.permission.count();
      const res = await get('/auth/me', ownerToken).expect(200);
      expect(res.body.data.isOwner).toBe(true);
      expect(res.body.data.permissions).toHaveLength(catalog);
      expect(res.body.data.permissions).toContain('AUDIT_VIEW');
    });

    it('includes the same view in the login response', async () => {
      const { user } = await userWith(['DASHBOARD_VIEW']);
      const { loginUser } = await loginAs(user.email);
      expect(loginUser.permissions).toEqual(['DASHBOARD_VIEW']);
      expect(loginUser).not.toHaveProperty('passwordHash');
    });

    it('reflects a role change on the next call and never leaks another user’s grants', async () => {
      const { user } = await userWith([]);
      const other = await userWith(['USERS_VIEW', 'AUDIT_VIEW']);
      const { token } = await loginAs(user.email);
      expect(
        (await get('/auth/me', token).expect(200)).body.data.permissions,
      ).toEqual([]);
      await grant(user.id, ['TASKS_CREATE']);
      const after = await get('/auth/me', token).expect(200);
      expect(after.body.data.permissions).toEqual(['TASKS_CREATE']);
      expect(after.body.data.permissions).not.toContain('AUDIT_VIEW');
      expect(other.user.id).not.toBe(user.id);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('does not let the authenticated user grant themselves anything through the profile endpoint', async () => {
      const { user } = await userWith([]);
      const { token } = await loginAs(user.email);
      await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Mallory',
          roles: ['x'],
          permissions: ['USERS_VIEW'],
          isOwner: true,
        })
        .expect(400);
      const me = await get('/auth/me', token).expect(200);
      expect(me.body.data.permissions).toEqual([]);
      expect(me.body.data.isOwner).toBe(false);
    });
  });

  describe('profiles', () => {
    it('returns the caller’s own roles, projects and tasks', async () => {
      const { user, role } = await userWith(
        ['PROJECTS_VIEW_ASSIGNED'],
        `Badge-${randomUUID().slice(0, 8)}`,
      );
      const active = await createProject(`Active-${randomUUID()}`, [user.id]);
      const closed = await prisma.project.create({
        data: {
          name: `Closed-${randomUUID()}`,
          status: 'COMPLETED',
          completedAt: new Date(),
          createdById: user.id,
          members: {
            create: { userId: user.id, role: 'MEMBER', addedById: user.id },
          },
        },
      });
      createdProjectIds.push(closed.id);
      const todo = await createTask(active.id, user.id, 'Open task');
      const done = await createTask(active.id, user.id, 'Finished task', true);
      const { token } = await loginAs(user.email);

      const res = await get('/me/profile', token).expect(200);
      const profile = res.body.data;
      expect(profile.roles).toEqual([
        expect.objectContaining({ id: role!.id, color: '#336699' }),
      ]);
      expect(profile.roles[0]).not.toHaveProperty('permissions');
      expect(profile.activeProjects.map((p: { id: string }) => p.id)).toEqual([
        active.id,
      ]);
      expect(profile.activeProjects[0]).toMatchObject({
        role: 'MANAGER',
        status: 'ACTIVE',
      });
      expect(profile.pastProjects.map((p: { id: string }) => p.id)).toEqual([
        closed.id,
      ]);
      expect(profile.activeTasks).toEqual([
        expect.objectContaining({
          id: todo.id,
          projectName: active.name,
          startDate: '2026-03-01',
          dueDate: '2026-03-05',
        }),
      ]);
      expect(profile.completedTasks.map((t: { id: string }) => t.id)).toEqual([
        done.id,
      ]);
    });

    it('shows another person’s profile only for projects the observer can see', async () => {
      const target = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const observer = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const shared = await createProject(`Shared-${randomUUID()}`, [
        target.id,
        observer.id,
      ]);
      const secret = await createProject(`Secret-${randomUUID()}`, [target.id]);
      await createTask(shared.id, target.id, 'Shared task');
      await createTask(secret.id, target.id, 'Secret task');
      const { token } = await loginAs(observer.email);

      const res = await get(`/users/${target.id}/profile`, token).expect(200);
      const body = JSON.stringify(res.body.data);
      expect(
        res.body.data.activeProjects.map((p: { id: string }) => p.id),
      ).toEqual([shared.id]);
      expect(
        res.body.data.activeTasks.map((t: { title: string }) => t.title),
      ).toEqual(['Shared task']);
      // IDOR: nothing about the project the observer is not part of.
      expect(body).not.toContain(secret.id);
      expect(body).not.toContain(secret.name);
      expect(body).not.toContain('Secret task');
    });

    it('shows nothing about projects or tasks to an observer without project visibility', async () => {
      const target = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const observer = (await userWith([])).user;
      const project = await createProject(`Hidden-${randomUUID()}`, [
        target.id,
      ]);
      await createTask(project.id, target.id, 'Hidden task');
      const { token } = await loginAs(observer.email);

      const res = await get(`/users/${target.id}/profile`, token).expect(200);
      expect(res.body.data).toMatchObject({
        activeProjects: [],
        pastProjects: [],
        activeTasks: [],
        completedTasks: [],
      });
      expect(JSON.stringify(res.body.data)).not.toContain(project.name);
    });

    it('shows every project to an observer with PROJECTS_VIEW_ALL and to the Owner', async () => {
      const target = (await userWith([])).user;
      const project = await createProject(`Org-${randomUUID()}`, [target.id]);
      const viewer = (await userWith(['PROJECTS_VIEW_ALL'])).user;
      const { token } = await loginAs(viewer.email);

      const asViewer = await get(`/users/${target.id}/profile`, token).expect(
        200,
      );
      expect(
        asViewer.body.data.activeProjects.map((p: { id: string }) => p.id),
      ).toEqual([project.id]);
      const asOwner = await get(
        `/users/${target.id}/profile`,
        ownerToken,
      ).expect(200);
      expect(
        asOwner.body.data.activeProjects.map((p: { id: string }) => p.id),
      ).toEqual([project.id]);
    });

    it('hides deleted projects and deleted tasks', async () => {
      const target = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const project = await createProject(`Deleted-${randomUUID()}`, [
        target.id,
      ]);
      const live = await createProject(`Live-${randomUUID()}`, [target.id]);
      const gone = await createTask(live.id, target.id, 'Deleted task');
      await prisma.task.update({
        where: { id: gone.id },
        data: { deletedAt: new Date() },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { deletedAt: new Date() },
      });
      const { token } = await loginAs(target.email);
      const res = await get('/me/profile', token).expect(200);
      expect(
        res.body.data.activeProjects.map((p: { id: string }) => p.id),
      ).toEqual([live.id]);
      expect(res.body.data.activeTasks).toEqual([]);
    });

    it('does not expose administrative fields of another user', async () => {
      const target = (await userWith([])).user;
      const observer = (await userWith([])).user;
      const { token } = await loginAs(observer.email);
      const res = await get(`/users/${target.id}/profile`, token).expect(200);
      for (const field of [
        'status',
        'isOwner',
        'lastLoginAt',
        'createdAt',
        'passwordHash',
        'userRoles',
      ]) {
        expect(res.body.data).not.toHaveProperty(field);
      }
    });

    it('404s for a suspended or unknown user, identically', async () => {
      const suspended = await createUser({ status: 'SUSPENDED' });
      const observer = (await userWith([])).user;
      const { token } = await loginAs(observer.email);
      await get(`/users/${suspended.id}/profile`, token).expect(404);
      await get(`/users/${randomUUID()}/profile`, token).expect(404);
    });
  });

  describe('role badges', () => {
    it('lists role summaries on /team without permissions', async () => {
      const name = `Team-${randomUUID().slice(0, 8)}`;
      const { user, role } = await userWith(['USERS_VIEW'], name);
      // A unique first name keeps the search independent of leftover users.
      await prisma.user.update({
        where: { id: user.id },
        data: { firstName: `Uniq${randomUUID().slice(0, 8)}` },
      });
      user.firstName = (
        await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      ).firstName;
      const viewer = (await userWith([])).user;
      const { token } = await loginAs(viewer.email);

      const res = await get('/team', token)
        .query({ search: user.firstName, pageSize: 100 })
        .expect(200);
      const entry = res.body.data.find((u: { id: string }) => u.id === user.id);
      expect(entry.roles).toEqual([
        expect.objectContaining({ id: role!.id, name }),
      ]);
      expect(JSON.stringify(entry)).not.toContain('USERS_VIEW');
      expect(entry).not.toHaveProperty('userRoles');
    });

    it('lists roles on the admin user list and detail, only for USERS_VIEW holders', async () => {
      const { user, role } = await userWith(['TASKS_CREATE']);
      const admin = (await userWith(['USERS_VIEW'])).user;
      const plain = (await userWith([])).user;
      const adminToken = (await loginAs(admin.email)).token;

      const detail = await get(`/users/${user.id}`, adminToken).expect(200);
      expect(detail.body.data.roles.map((r: { id: string }) => r.id)).toEqual([
        role!.id,
      ]);
      const list = await get('/users', adminToken)
        .query({ roleId: role!.id })
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].roles.map((r: { id: string }) => r.id)).toEqual([
        role!.id,
      ]);
      expect(list.body.data[0]).not.toHaveProperty('userRoles');

      const plainToken = (await loginAs(plain.email)).token;
      await get(`/users/${user.id}`, plainToken).expect(403);
    });
  });

  describe('GET /activity (cross-project feed)', () => {
    it('returns events with actor and project names, only for visible projects', async () => {
      const member = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const outsider = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const mine = await createProject(`Mine-${randomUUID()}`, [member.id]);
      const theirs = await createProject(`Theirs-${randomUUID()}`, [
        outsider.id,
      ]);
      await prisma.activityEvent.createMany({
        data: [
          {
            projectId: mine.id,
            actorId: member.id,
            type: 'TASK_CREATED',
            entityType: 'Task',
            metadata: { title: 'A' },
          },
          {
            projectId: theirs.id,
            actorId: outsider.id,
            type: 'TASK_CREATED',
            entityType: 'Task',
            metadata: { title: 'B' },
          },
        ],
      });
      const { token } = await loginAs(member.email);

      const res = await get('/activity', token)
        .query({ pageSize: 100 })
        .expect(200);
      const projectIds = res.body.data.map(
        (e: { projectId: string }) => e.projectId,
      );
      expect(projectIds).toContain(mine.id);
      expect(projectIds).not.toContain(theirs.id);
      const event = res.body.data.find(
        (e: { projectId: string }) => e.projectId === mine.id,
      );
      expect(event.actor).toEqual({
        id: member.id,
        firstName: 'Test',
        lastName: 'User',
      });
      expect(event.project).toEqual({ id: mine.id, name: mine.name });
      expect(event.actor).not.toHaveProperty('email');
      expect(JSON.stringify(res.body)).not.toContain(theirs.name);
    });

    it('is empty for a user with no project visibility, and unauthenticated calls get 401', async () => {
      const user = (await userWith([])).user;
      const project = await createProject(`Any-${randomUUID()}`, [user.id]);
      await prisma.activityEvent.create({
        data: {
          projectId: project.id,
          actorId: user.id,
          type: 'PROJECT_CREATED',
          entityType: 'Project',
        },
      });
      const { token } = await loginAs(user.email);
      const res = await get('/activity', token).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
      await request(app.getHttpServer()).get('/api/v1/activity').expect(401);
    });

    it('excludes deleted projects, paginates newest first, and filters by type', async () => {
      const user = (await userWith(['PROJECTS_VIEW_ASSIGNED'])).user;
      const live = await createProject(`Live-${randomUUID()}`, [user.id]);
      const dead = await createProject(`Dead-${randomUUID()}`, [user.id]);
      await prisma.activityEvent.createMany({
        data: [
          {
            projectId: live.id,
            actorId: user.id,
            type: 'TASK_CREATED',
            entityType: 'Task',
            createdAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            projectId: live.id,
            actorId: user.id,
            type: 'TASK_COMPLETED',
            entityType: 'Task',
            createdAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            projectId: dead.id,
            actorId: user.id,
            type: 'TASK_CREATED',
            entityType: 'Task',
            createdAt: new Date('2026-01-03T10:00:00Z'),
          },
        ],
      });
      await prisma.project.update({
        where: { id: dead.id },
        data: { deletedAt: new Date() },
      });
      const { token } = await loginAs(user.email);

      const all = await get('/activity', token)
        .query({ pageSize: 1 })
        .expect(200);
      expect(all.body.data).toHaveLength(1);
      expect(all.body.data[0].type).toBe('TASK_COMPLETED');
      expect(all.body.meta.total).toBe(2);
      const filtered = await get('/activity', token)
        .query({ type: 'TASK_CREATED' })
        .expect(200);
      expect(
        filtered.body.data.every(
          (e: { projectId: string }) => e.projectId === live.id,
        ),
      ).toBe(true);
    });

    it('rejects a page size above the maximum', async () => {
      const user = (await userWith([])).user;
      const { token } = await loginAs(user.email);
      await get('/activity', token).query({ pageSize: 1000 }).expect(400);
    });
  });
});
