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
describe('Audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerAccessToken: string;

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

    const ownerEmail = process.env.OWNER_EMAIL!;
    const ownerPassword = process.env.OWNER_PASSWORD!;
    const login = await loginAs(ownerEmail, ownerPassword);
    ownerAccessToken = login.accessToken;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    // Invitation.userId is onDelete: Restrict — the invitation created above
    // must go before its User row.
    await prisma.invitation.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await app.close();
  });

  it('rejects a user without AUDIT_VIEW', async () => {
    const user = await createUserWithPermissions([]);
    const { accessToken } = await loginAs(user.email);
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('records USER_SUSPENDED with the acting admin as actor and the target as entity', async () => {
    const target = await createActiveUser();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    const owner = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'USER_SUSPENDED', entityId: target.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorId).toBe(owner.body.data.id);
    expect(entry?.entityType).toBe('User');
  });

  // Regression coverage for a Phase 12 Codex adversarial review finding: the
  // `userAgent` column is varchar(512), and an oversized header used to make
  // the (best-effort, post-commit) audit insert fail silently while the
  // suspend still succeeded with no audit trail. It's now truncated and
  // written atomically with the mutation, so the endpoint call and its audit
  // row must both still succeed.
  it('truncates an oversized User-Agent instead of losing the audit row for it', async () => {
    const target = await createActiveUser();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .set('User-Agent', 'a'.repeat(600))
      .expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'USER_SUSPENDED', entityId: target.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userAgent).toHaveLength(512);
  });

  it('records USER_INVITED, ROLE_CREATED and USER_ROLES_ASSIGNED, and never leaks a password/token into metadata', async () => {
    const email = `${randomUUID()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
      .expect(200);
    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email },
    });
    createdUserIds.push(invitedUser.id);

    const invitedEntry = await prisma.auditLog.findFirst({
      where: { action: 'USER_INVITED', entityId: invitedUser.id },
    });
    expect(invitedEntry).not.toBeNull();
    const metadataString = JSON.stringify(invitedEntry?.metadata ?? {});
    expect(metadataString).not.toMatch(/token/i);
    expect(metadataString).not.toMatch(/password/i);

    const roleRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        name: `Audit Role ${randomUUID()}`,
        color: '#336699',
        position: 1,
        permissionIds: [],
      })
      .expect(201);
    const roleId = roleRes.body.data.id as string;
    createdRoleIds.push(roleId);

    const roleCreatedEntry = await prisma.auditLog.findFirst({
      where: { action: 'ROLE_CREATED', entityId: roleId },
    });
    expect(roleCreatedEntry).not.toBeNull();

    await request(app.getHttpServer())
      .put(`/api/v1/users/${invitedUser.id}/roles`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ roleIds: [roleId] })
      .expect(200);

    const assignedEntry = await prisma.auditLog.findFirst({
      where: { action: 'USER_ROLES_ASSIGNED', entityId: invitedUser.id },
    });
    expect(assignedEntry).not.toBeNull();
  });

  it('lists audit entries filtered by action and entityId for a caller with AUDIT_VIEW', async () => {
    const target = await createActiveUser();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);

    const auditor = await createUserWithPermissions(['AUDIT_VIEW']);
    const { accessToken } = await loginAs(auditor.email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit')
      .query({ action: 'USER_SUSPENDED', entityId: target.id })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.data.every(
        (entry: { action: string; entityId: string }) =>
          entry.action === 'USER_SUSPENDED' && entry.entityId === target.id,
      ),
    ).toBe(true);

    const entryId = res.body.data[0].id as string;
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/audit/${entryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getRes.body.data.id).toBe(entryId);
  });

  it('404s on a nonexistent audit entry', async () => {
    const auditor = await createUserWithPermissions(['AUDIT_VIEW']);
    const { accessToken } = await loginAs(auditor.email);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/${randomUUID()}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
