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
describe('Tasks (e2e)', () => {
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

  async function createTaskDirect(
    projectId: string,
    creatorId: string,
    assigneeIds: string[],
  ) {
    const task = await prisma.task.create({
      data: {
        projectId,
        title: `Task-${randomUUID()}`,
        startDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-10'),
        status: 'PENDING',
        createdById: creatorId,
        assignees: {
          createMany: {
            data: assigneeIds.map((userId) => ({
              userId,
              assignedById: creatorId,
            })),
          },
        },
      },
    });
    return task;
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
    await prisma.taskAssignee.deleteMany({
      where: { task: { projectId: { in: createdProjectIds } } },
    });
    await prisma.task.deleteMany({
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

  describe('POST /projects/{projectId}/tasks', () => {
    it('allows the Owner to create a task in any project without membership', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          title: 'Owner task',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [manager.id],
        })
        .expect(201);
      expect(res.body.data.title).toBe('Owner task');
    });

    it('rejects a user without TASKS_CREATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [manager.id],
        })
        .expect(403);
    });

    it('rejects a VIEWER with TASKS_CREATE (needs MEMBER or MANAGER local role, or override)', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const viewer = await createUserWithPermissions([
        'TASKS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, viewer.id, 'VIEWER');
      const { accessToken } = await loginAs(viewer.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [viewer.id],
        })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows a MEMBER with TASKS_CREATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const member = await createUserWithPermissions([
        'TASKS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, member.id, 'MEMBER');
      const { accessToken } = await loginAs(member.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'A new task',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [member.id],
        })
        .expect(201);
      expect(res.body.data.createdById).toBe(member.id);
    });

    it('rejects an assignee who is not a current member of the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const outsider = await createActiveUser();
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [outsider.id],
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty assigneeIds array', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          assigneeIds: [],
        })
        .expect(400);
    });

    it('rejects a dueDate before startDate', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_CREATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Should fail',
          startDate: '2026-01-10',
          dueDate: '2026-01-01',
          assigneeIds: [manager.id],
        })
        .expect(400);
    });
  });

  describe('GET /projects/{projectId}/tasks/{taskId}', () => {
    it('404s for a task belonging to a different project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const projectA = await createProjectDirect(manager.id);
      const projectB = await createProjectDirect(manager.id);
      const task = await createTaskDirect(projectA.id, manager.id, [
        manager.id,
      ]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectB.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('404s for an actor with no visibility into the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /projects/{projectId}/tasks/{taskId}', () => {
    it('allows the creator with TASKS_UPDATE even without a MANAGER role', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const creator = await createUserWithPermissions([
        'TASKS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, creator.id, 'MEMBER');
      const task = await createTaskDirect(project.id, creator.id, [creator.id]);
      const { accessToken } = await loginAs(creator.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Renamed by creator' })
        .expect(200);
      expect(res.body.data.title).toBe('Renamed by creator');
    });

    it('rejects a plain assignee (not the creator) even with TASKS_UPDATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createUserWithPermissions([
        'TASKS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const task = await createTaskDirect(project.id, manager.id, [
        assignee.id,
      ]);
      const { accessToken } = await loginAs(assignee.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Should fail' })
        .expect(403);
    });

    it('allows a MANAGER with TASKS_UPDATE even without being the creator', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const someoneElse = await createActiveUser();
      await addMemberDirect(project.id, someoneElse.id, 'MEMBER');
      const task = await createTaskDirect(project.id, someoneElse.id, [
        someoneElse.id,
      ]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Renamed by manager' })
        .expect(200);
    });

    it('rejects status=DONE at the validation layer (must use the complete endpoint)', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'DONE' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects any status change on an already-DONE task, but still allows content edits', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
        'TASKS_COMPLETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const conflictRes = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);
      expect(conflictRes.body.error.code).toBe('CONFLICT');

      const editRes = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Edited after completion' })
        .expect(200);
      expect(editRes.body.data.title).toBe('Edited after completion');
    });
  });

  describe('POST /projects/{projectId}/tasks/{taskId}/complete', () => {
    it('rejects a non-assignee, non-manager actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const outsiderMember = await createUserWithPermissions([
        'TASKS_COMPLETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, outsiderMember.id, 'MEMBER');
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(outsiderMember.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows the assignee with TASKS_COMPLETE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const assignee = await createUserWithPermissions([
        'TASKS_COMPLETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, assignee.id, 'MEMBER');
      const task = await createTaskDirect(project.id, manager.id, [
        assignee.id,
      ]);
      const { accessToken } = await loginAs(assignee.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('DONE');
      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('is idempotent when called twice', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_COMPLETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(second.body.data.completedAt).toBe(first.body.data.completedAt);
    });
  });

  describe('POST /projects/{projectId}/tasks/{taskId}/reopen', () => {
    it('rejects the creator alone (without MANAGER/override), even with TASKS_UPDATE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_COMPLETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const creator = await createUserWithPermissions([
        'TASKS_UPDATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, creator.id, 'MEMBER');
      const task = await createTaskDirect(project.id, creator.id, [creator.id]);

      const managerToken = (await loginAs(manager.email)).accessToken;
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const { accessToken } = await loginAs(creator.email);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('rejects reopening a task that is not currently DONE', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('allows a MANAGER to reopen a DONE task and clears completedAt', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
        'TASKS_COMPLETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.completedAt).toBeNull();
    });
  });

  describe('PUT /projects/{projectId}/tasks/{taskId}/assignees', () => {
    it('rejects an empty assignee set', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .put(`/api/v1/projects/${project.id}/tasks/${task.id}/assignees`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeIds: [] })
        .expect(400);
    });

    it('replaces the assignee set', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_UPDATE',
      ]);
      const project = await createProjectDirect(manager.id);
      const newAssignee = await createActiveUser();
      await addMemberDirect(project.id, newAssignee.id, 'MEMBER');
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/projects/${project.id}/tasks/${task.id}/assignees`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeIds: [newAssignee.id] })
        .expect(200);
      expect(
        res.body.data.assignees.map((a: { userId: string }) => a.userId),
      ).toEqual([newAssignee.id]);
    });
  });

  describe('DELETE /projects/{projectId}/tasks/{taskId}', () => {
    it('rejects a non-manager, non-override actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const creator = await createUserWithPermissions([
        'TASKS_DELETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, creator.id, 'MEMBER');
      const task = await createTaskDirect(project.id, creator.id, [creator.id]);
      const { accessToken } = await loginAs(creator.email);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('logically deletes and hides the task from further reads', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_DELETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /projects/{projectId}/tasks', () => {
    it('excludes DONE tasks by default and includes them with includeCompleted=true', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'TASKS_COMPLETE',
      ]);
      const project = await createProjectDirect(manager.id);
      const task = await createTaskDirect(project.id, manager.id, [manager.id]);
      const { accessToken } = await loginAs(manager.email);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const defaultRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        defaultRes.body.data.map((t: { id: string }) => t.id),
      ).not.toContain(task.id);

      const includeRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/tasks`)
        .query({ includeCompleted: 'true' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(includeRes.body.data.map((t: { id: string }) => t.id)).toContain(
        task.id,
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
        .get(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
