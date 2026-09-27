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
 * Requires a reachable PostgreSQL instance (see docker-compose.dev.yml) and
 * the seeded Owner (apps/api/.env's OWNER_EMAIL/OWNER_PASSWORD, or a real
 * bootstrap in other environments). Not part of `pnpm test`; run via
 * `pnpm --filter api test:e2e`.
 */
describe('Users & Invitations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerAccessToken: string;

  const password = 'a-plain-user-password-123';
  const createdUserIds: string[] = [];

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
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.invitationRole.deleteMany({
      where: { invitation: { userId: { in: createdUserIds } } },
    });
    await prisma.invitation.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('Permission enforcement', () => {
    it('denies a plain authenticated user (no roles) access to GET /users', async () => {
      const user = await createActiveUser();
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows the Owner to list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('allows any authenticated ACTIVE user to view their own profile and the team directory', async () => {
      const user = await createActiveUser();
      const { accessToken } = await loginAs(user.email);
      await request(app.getHttpServer())
        .get('/api/v1/me/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/team')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it("does not leak another user's admin fields via GET /users/{userId}/profile", async () => {
      const target = await createActiveUser();
      const viewer = await createActiveUser();
      const { accessToken } = await loginAs(viewer.email);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${target.id}/profile`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(target.id);
      expect(res.body.data.status).toBeUndefined();
      expect(res.body.data.isOwner).toBeUndefined();
      expect(res.body.data.lastLoginAt).toBeUndefined();
      expect(res.body.data.createdAt).toBeUndefined();
    });

    it('404s viewing the public profile of a non-ACTIVE user (no enumeration)', async () => {
      const target = await createActiveUser();
      await prisma.user.update({
        where: { id: target.id },
        data: { status: 'SUSPENDED' },
      });
      const viewer = await createActiveUser();
      const { accessToken } = await loginAs(viewer.email);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${target.id}/profile`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Owner protection', () => {
    it('rejects suspending the Owner', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/users/${me.body.data.id}/suspend`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(403);
    });

    it('rejects disabling the Owner', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/users/${me.body.data.id}/disable`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(403);
    });
  });

  describe('Status transitions', () => {
    it('suspend transactionally revokes sessions, and login fails afterward', async () => {
      const user = await createActiveUser();
      const { cookie } = await loginAs(user.email);

      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/suspend`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(401);
      expect(loginRes.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('disable transactionally revokes sessions', async () => {
      const user = await createActiveUser();
      const { cookie } = await loginAs(user.email);

      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/disable`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('reactivate moves SUSPENDED back to ACTIVE but does not restore sessions', async () => {
      const user = await createActiveUser();
      const { cookie } = await loginAs(user.email);

      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/suspend`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const reactivateRes = await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/reactivate`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(reactivateRes.body.data.status).toBe('ACTIVE');

      // The old session was revoked by suspend and reactivate doesn't bring it back.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      // But a fresh login now works again.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(200);
    });

    it('rejects reactivating a user that is not currently SUSPENDED', async () => {
      const user = await createActiveUser();
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/reactivate`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(409);
    });

    it('rejects suspending an INVITED user (no password yet, would break reactivation)', async () => {
      const email = `${randomUUID()}@example.test`;
      await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'Pending', lastName: 'Invite', roleIds: [] })
        .expect(200);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);

      await request(app.getHttpServer())
        .post(`/api/v1/users/${invitedUser.id}/suspend`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(409);
    });
  });

  describe('Profile mass-assignment protection', () => {
    it('rejects unknown/privileged fields on PATCH /me/profile', async () => {
      const user = await createActiveUser();
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'NewName',
          email: 'hacker@example.com',
          isOwner: true,
          status: 'ACTIVE',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an explicit null on a required field instead of crashing', async () => {
      const user = await createActiveUser();
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: null })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows updating firstName/lastName on PATCH /me/profile', async () => {
      const user = await createActiveUser();
      const { accessToken } = await loginAs(user.email);
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);
      expect(res.body.data.firstName).toBe('Updated');
      expect(res.body.data.email).toBe(user.email);
    });
  });

  describe('Invitations', () => {
    it('creates, accepts, and logs in with a new invitation end to end', async () => {
      const email = `${randomUUID()}@example.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
        .expect(200);

      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);

      expect(createRes.body.data.manualLink).toContain('#token=');
      const token = new URL(
        createRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;

      await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'new-hire-password-123' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'new-hire-password-123' })
        .expect(200);
    });

    it('rejects an already-accepted token being reused', async () => {
      const email = `${randomUUID()}@example.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
        .expect(200);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);
      const token = new URL(
        createRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;

      await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'password-123456' })
        .expect(204);

      const replay = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'different-password-123' })
        .expect(400);
      expect(replay.body.error.code).toBe('INVITATION_INVALID');
    });

    it('rejects a revoked invitation token', async () => {
      const email = `${randomUUID()}@example.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
        .expect(200);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);
      const token = new URL(
        createRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;

      await request(app.getHttpServer())
        .post(`/api/v1/invitations/${createRes.body.data.id}/revoke`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'password-123456' })
        .expect(400);
      expect(res.body.error.code).toBe('INVITATION_INVALID');
    });

    it('rejects a nonexistent/garbage token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: 'totally-made-up-token', password: 'password-123456' })
        .expect(400);
      expect(res.body.error.code).toBe('INVITATION_INVALID');
    });

    it('resend invalidates the old token and issues a new one', async () => {
      const email = `${randomUUID()}@example.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
        .expect(200);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);
      const oldToken = new URL(
        createRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;

      const resendRes = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${createRes.body.data.id}/resend`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      const newToken = new URL(
        resendRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;
      expect(newToken).not.toBe(oldToken);

      await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: oldToken, password: 'password-123456' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: newToken, password: 'password-123456' })
        .expect(204);
    });

    it('only lets one of two concurrent accepts with the same token succeed', async () => {
      const email = `${randomUUID()}@example.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email, firstName: 'New', lastName: 'Hire', roleIds: [] })
        .expect(200);
      const invitedUser = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      createdUserIds.push(invitedUser.id);
      const token = new URL(
        createRes.body.data.manualLink.replace('#', '?'),
      ).searchParams.get('token')!;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/invitations/accept')
          .send({ token, password: 'password-123456' }),
        request(app.getHttpServer())
          .post('/api/v1/invitations/accept')
          .send({ token, password: 'a-different-password-123' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([204, 400]);
    });

    it('rejects duplicate roleIds at the validation layer', async () => {
      const role = await prisma.role.create({
        data: { name: `Role-${randomUUID()}`, color: '#336699', position: 1 },
      });
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/invitations')
          .set('Authorization', `Bearer ${ownerAccessToken}`)
          .send({
            email: `${randomUUID()}@example.test`,
            firstName: 'New',
            lastName: 'Hire',
            roleIds: [role.id, role.id],
          })
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      } finally {
        await prisma.role.delete({ where: { id: role.id } });
      }
    });
  });

  describe('Pagination', () => {
    it('reports totalPages: 0 for an empty result set', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ search: `no-such-user-${randomUUID()}` })
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
      expect(res.body.meta.totalPages).toBe(0);
    });
  });
});
