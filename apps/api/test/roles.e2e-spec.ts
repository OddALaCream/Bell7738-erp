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
describe('Roles & permission assignment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerAccessToken: string;
  let ownerId: string;

  const password = 'a-plain-user-password-123';
  const createdUserIds: string[] = [];
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
    return {
      accessToken: res.body.data.accessToken as string,
      cookie: res.headers['set-cookie']?.[0] as string,
    };
  }

  async function createRoleWithPermissions(keys: string[]) {
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
    return role;
  }

  async function createUserWithPermissions(keys: string[]) {
    const user = await createActiveUser();
    const role = await createRoleWithPermissions(keys);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    return { user, role };
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
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);
    ownerId = me.body.data.id;
  });

  afterAll(async () => {
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
    await prisma.userRole.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await app.close();
  });

  describe('GET /permissions', () => {
    it('rejects a plain authenticated user (no ROLES_VIEW/ROLES_MANAGE)', async () => {
      const { user } = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(user.email);
      await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows a user holding ROLES_VIEW', async () => {
      const { user } = await createUserWithPermissions(['ROLES_VIEW']);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(24);
    });

    it('allows the Owner unconditionally', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
    });
  });

  describe('GET /roles (summary vs. full detail)', () => {
    it('returns only badge summaries for a user without ROLES_VIEW', async () => {
      const { user } = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).not.toHaveProperty('permissions');
      expect(res.body.data[0]).toHaveProperty('color');
    });

    it('returns full detail (including permissions) for a user with ROLES_VIEW', async () => {
      const { user } = await createUserWithPermissions(['ROLES_VIEW']);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data[0]).toHaveProperty('permissions');
    });
  });

  describe('Role CRUD happy path (Owner)', () => {
    it('creates, reads, updates, and deletes a role', async () => {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'USERS_VIEW' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: `QA Role ${randomUUID()}`,
          description: 'A test role',
          color: '#ABCDEF',
          position: 5,
          permissionIds: [permission.id],
        })
        .expect(201);
      const roleId = createRes.body.data.id as string;
      createdRoleIds.push(roleId);
      expect(createRes.body.data.permissions).toHaveLength(1);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(getRes.body.data.color).toBe('#ABCDEF');

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ color: '#123456', permissionIds: [] })
        .expect(200);
      expect(patchRes.body.data.color).toBe('#123456');
      expect(patchRes.body.data.permissions).toHaveLength(0);

      await request(app.getHttpServer())
        .delete(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(204);
      createdRoleIds.splice(createdRoleIds.indexOf(roleId), 1);

      await request(app.getHttpServer())
        .get(`/api/v1/roles/${roleId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(404);
    });

    it('rejects a duplicate role name (case-insensitive)', async () => {
      const name = `Dup Role ${randomUUID()}`;
      const first = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ name, color: '#336699', position: 1, permissionIds: [] })
        .expect(201);
      createdRoleIds.push(first.body.data.id);

      const res = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: name.toUpperCase(),
          color: '#336699',
          position: 1,
          permissionIds: [],
        })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Anti-escalation on role create/update', () => {
    it('blocks a non-owner with ROLES_MANAGE from granting a permission they do not hold', async () => {
      const { user } = await createUserWithPermissions(['ROLES_MANAGE']);
      const { accessToken } = await loginAs(user.email);
      const otherPermission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'USERS_DISABLE' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `Escalation-${randomUUID()}`,
          color: '#336699',
          position: 1,
          permissionIds: [otherPermission.id],
        })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows a non-owner with ROLES_MANAGE to grant a permission they hold', async () => {
      const { user } = await createUserWithPermissions([
        'ROLES_MANAGE',
        'USERS_DISABLE',
      ]);
      const { accessToken } = await loginAs(user.email);
      const grantedPermission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'USERS_DISABLE' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `Allowed-${randomUUID()}`,
          color: '#336699',
          position: 1,
          permissionIds: [grantedPermission.id],
        })
        .expect(201);
      createdRoleIds.push(res.body.data.id);
    });

    it('allows the Owner to create a role with any permission', async () => {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'AUDIT_VIEW' },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: `Owner-role-${randomUUID()}`,
          color: '#336699',
          position: 1,
          permissionIds: [permission.id],
        })
        .expect(201);
      createdRoleIds.push(res.body.data.id);
    });

    // Regression coverage for a real finding from the Phase 6 Codex
    // adversarial review: an actor without AUDIT_VIEW could silently strip
    // it from an existing role via PATCH, since only the NEW set was ever
    // validated against the actor's own effective permissions.
    it('blocks a non-owner with ROLES_MANAGE from stripping a permission they do not hold from an existing role', async () => {
      const auditPermission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'AUDIT_VIEW' },
      });
      const usersViewPermission = await prisma.permission.findUniqueOrThrow({
        where: { key: 'USERS_VIEW' },
      });
      const role = await prisma.role.create({
        data: {
          name: `Auditor-${randomUUID()}`,
          color: '#336699',
          position: 1,
          rolePermissions: {
            createMany: { data: [{ permissionId: auditPermission.id }] },
          },
        },
      });
      createdRoleIds.push(role.id);

      const { user } = await createUserWithPermissions([
        'ROLES_MANAGE',
        'USERS_VIEW',
      ]);
      const { accessToken } = await loginAs(user.email);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissionIds: [usersViewPermission.id] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const stillHasAudit = await prisma.rolePermission.findFirst({
        where: { roleId: role.id, permissionId: auditPermission.id },
      });
      expect(stillHasAudit).not.toBeNull();
    });
  });

  describe('DELETE /roles/{roleId} assignment protection', () => {
    it('rejects deleting a role that is currently assigned to a user', async () => {
      const { role } = await createUserWithPermissions(['USERS_VIEW']);
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('deletes a role that is not assigned to anyone', async () => {
      const role = await createRoleWithPermissions([]);
      await request(app.getHttpServer())
        .delete(`/api/v1/roles/${role.id}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(204);
      createdRoleIds.splice(createdRoleIds.indexOf(role.id), 1);
    });
  });

  describe('PUT /users/{userId}/roles', () => {
    it('rejects a non-owner assigning roles to themselves', async () => {
      const { user } = await createUserWithPermissions(['USERS_ROLES_MANAGE']);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${user.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleIds: [] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects the Owner assigning roles to themselves', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/users/${ownerId}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roleIds: [] })
        .expect(403);
    });

    it('rejects targeting the Owner as another actor', async () => {
      const { user } = await createUserWithPermissions(['USERS_ROLES_MANAGE']);
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${ownerId}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleIds: [] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it("replaces the target user's full role set and does not revoke sessions", async () => {
      const target = await createActiveUser();
      const { cookie } = await loginAs(target.email);
      const roleA = await createRoleWithPermissions([]);
      const roleB = await createRoleWithPermissions([]);

      await request(app.getHttpServer())
        .put(`/api/v1/users/${target.id}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roleIds: [roleA.id] })
        .expect(200);
      let assigned = await prisma.userRole.findMany({
        where: { userId: target.id },
      });
      expect(assigned.map((r) => r.roleId)).toEqual([roleA.id]);

      await request(app.getHttpServer())
        .put(`/api/v1/users/${target.id}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roleIds: [roleB.id] })
        .expect(200);
      assigned = await prisma.userRole.findMany({
        where: { userId: target.id },
      });
      expect(assigned.map((r) => r.roleId)).toEqual([roleB.id]);

      // Role changes are not a security-status change, unlike email/status
      // updates, so the existing session must survive.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
    });

    it('propagates anti-escalation when replacing a role set via a non-owner actor', async () => {
      const { user: actor } = await createUserWithPermissions([
        'USERS_ROLES_MANAGE',
      ]);
      const { accessToken } = await loginAs(actor.email);
      const targetUser = await createActiveUser();
      const disallowedRole = await createRoleWithPermissions(['USERS_DISABLE']);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${targetUser.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleIds: [disallowedRole.id] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    // Regression coverage for a real finding from the Phase 6 Codex
    // adversarial review: an actor without AUDIT_VIEW could strip a role
    // carrying it from a target by replacing with an empty/smaller set,
    // since only the NEW set was ever validated against the actor.
    it('rejects stripping a role whose permissions the actor does not hold via an empty replacement', async () => {
      const { user: actor } = await createUserWithPermissions([
        'USERS_ROLES_MANAGE',
      ]);
      const { accessToken } = await loginAs(actor.email);
      const targetUser = await createActiveUser();
      const auditRole = await createRoleWithPermissions(['AUDIT_VIEW']);
      await prisma.userRole.create({
        data: { userId: targetUser.id, roleId: auditRole.id },
      });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${targetUser.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleIds: [] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const stillAssigned = await prisma.userRole.findMany({
        where: { userId: targetUser.id },
      });
      expect(stillAssigned.map((r) => r.roleId)).toEqual([auditRole.id]);
    });

    it('rejects self-assignment even when the userId only differs in UUID casing', async () => {
      const { user: actor } = await createUserWithPermissions([
        'USERS_ROLES_MANAGE',
      ]);
      const { accessToken } = await loginAs(actor.email);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${actor.id.toUpperCase()}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleIds: [] })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('grants effective permissions end to end: assigning USERS_VIEW via a role unlocks GET /users', async () => {
      const target = await createActiveUser();
      const before = await loginAs(target.email);
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${before.accessToken}`)
        .expect(403);

      const role = await createRoleWithPermissions(['USERS_VIEW']);
      await request(app.getHttpServer())
        .put(`/api/v1/users/${target.id}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ roleIds: [role.id] })
        .expect(200);

      const after = await loginAs(target.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${after.accessToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
