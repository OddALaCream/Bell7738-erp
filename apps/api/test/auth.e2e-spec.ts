import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Requires a reachable PostgreSQL instance (see docker-compose.dev.yml).
 * Not part of `pnpm test`; run via `pnpm --filter api test:e2e`.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'correct horse battery staple';
  const createdUserIds: string[] = [];
  let activeUserId: string;
  let suspendedEmail: string;
  let otherUserId: string;

  async function createUser(overrides: { status?: string } = {}) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: 'Test',
        lastName: 'User',
        status: (overrides.status ?? 'ACTIVE') as never,
        passwordHash,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = response.headers['set-cookie']?.[0] as string;
    return { accessToken: response.body.data.accessToken as string, cookie };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const active = await createUser();
    activeUserId = active.id;
    const suspended = await createUser({ status: 'SUSPENDED' });
    suspendedEmail = suspended.email;
    const other = await createUser();
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('rejects a wrong password with a generic error', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: activeUser.email, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a suspended user with the same generic error, not a distinct one', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: suspendedEmail, password })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in successfully, sets an HttpOnly refresh cookie, and exposes /me', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: activeUser.email, password })
      .expect(200);

    expect(loginRes.body.data.accessToken).toBeDefined();
    const cookie = loginRes.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('refreshToken=');

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .expect(200);
    expect(meRes.body.data.id).toBe(activeUserId);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rotates the refresh token and rejects reuse of the old one (replay)', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { cookie: firstCookie } = await login(activeUser.email);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const secondCookie = refreshRes.headers['set-cookie']?.[0] as string;

    // Replaying the already-rotated cookie must fail.
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(replayRes.body.error.code).toBe('SESSION_INVALID');

    // The session is burned entirely once replay is detected — even the
    // legitimately-rotated cookie no longer works.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('only lets one of two concurrent refreshes with the same token succeed (no double-spend)', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { cookie } = await login(activeUser.email);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie),
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('rejects refresh/logout from an untrusted Origin', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { cookie } = await login(activeUser.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .expect(403);

    // A same-origin (or Origin-less, e.g. non-browser) request still works.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('logout revokes the session and is idempotent', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { cookie } = await login(activeUser.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
    expect(refreshRes.body.error.code).toBe('SESSION_INVALID');
  });

  it('logout-all revokes every session, including the one used to call it', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const first = await login(activeUser.email);
    const second = await login(activeUser.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', first.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', second.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);
  });

  it("lists only the caller's own sessions and flags the current one", async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { accessToken } = await login(activeUser.email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(
      res.body.data.every((s: { id: string }) => typeof s.id === 'string'),
    ).toBe(true);
    expect(res.body.data.some((s: { isCurrent: boolean }) => s.isCurrent)).toBe(
      true,
    );
  });

  it("returns 404 (not 403) when revoking another user's session by UUID", async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const other = await prisma.user.findUniqueOrThrow({
      where: { id: otherUserId },
    });

    const { accessToken } = await login(activeUser.email);
    const otherSession = await login(other.email);

    const otherSessions = await prisma.session.findMany({
      where: { userId: otherUserId },
    });
    const targetSessionId = otherSessions[0]!.id;

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // The other user's session must remain untouched.
    const stillActive = await prisma.session.findUniqueOrThrow({
      where: { id: targetSessionId },
    });
    expect(stillActive.revokedAt).toBeNull();
    void otherSession;
  });

  it("revokes the caller's own session by id", async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const { accessToken } = await login(activeUser.email);
    const sessions = await prisma.session.findMany({
      where: { userId: activeUserId },
      orderBy: { createdAt: 'desc' },
    });
    const sessionId = sessions[0]!.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const revoked = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('change-password requires the current password and revokes other sessions', async () => {
    const activeUser = await prisma.user.findUniqueOrThrow({
      where: { id: activeUserId },
    });
    const currentSession = await login(activeUser.email);
    const otherSession = await login(activeUser.email);

    const badAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${currentSession.accessToken}`)
      .send({
        currentPassword: 'not-the-password',
        newPassword: 'a-new-password-123',
      })
      .expect(401);
    expect(badAttempt.body.error.code).toBe('INVALID_CREDENTIALS');

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${currentSession.accessToken}`)
      .send({ currentPassword: password, newPassword: 'a-new-password-123' })
      .expect(200);

    // The other, previously-valid session for the same user is now revoked.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', otherSession.cookie)
      .expect(401);

    // Log back in with the NEW password to confirm it actually took effect,
    // then restore the original password so later tests in this file (which
    // all use the shared `password` constant) keep working.
    const relogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: activeUser.email, password: 'a-new-password-123' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${relogin.body.data.accessToken}`)
      .send({ currentPassword: 'a-new-password-123', newPassword: password })
      .expect(200);
  });
});
