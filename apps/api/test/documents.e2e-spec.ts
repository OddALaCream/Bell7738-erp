import 'dotenv/config';
import { existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';

const PDF_BYTES = Buffer.from('%PDF-1.7\n%mock pdf content for e2e tests\n');
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

/**
 * Requires a reachable PostgreSQL instance (see docker-compose.dev.yml) with
 * the permission catalog seeded (`pnpm --filter api seed`) and the Owner
 * bootstrapped. Not part of `pnpm test`; run via `pnpm --filter api test:e2e`.
 */
describe('Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
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

  function uploadPdf(projectId: string, accessToken: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PDF_BYTES, 'Report.pdf');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    const ownerEmail = process.env.OWNER_EMAIL!;
    const ownerPassword = process.env.OWNER_PASSWORD!;
    const login = await loginAs(ownerEmail, ownerPassword);
    ownerAccessToken = login.accessToken;
  });

  afterAll(async () => {
    const documents = await prisma.document.findMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await Promise.all(
      documents.map((doc) => storage.deleteIfExists(doc.storageKey)),
    );
    await prisma.document.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    await prisma.projectMember.deleteMany({
      where: { projectId: { in: createdProjectIds } },
    });
    // ActivityEvent.projectId is a real FK (onDelete: Restrict) — the
    // document upload/delete calls above now record activity, so these rows
    // must go before the project itself can be deleted.
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

  describe('POST /projects/{projectId}/documents', () => {
    it('rejects a user without DOCUMENTS_UPLOAD', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      await uploadPdf(project.id, accessToken).expect(403);
    });

    it('rejects a VIEWER with DOCUMENTS_UPLOAD (needs MEMBER or MANAGER local role, or override)', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const viewer = await createUserWithPermissions([
        'DOCUMENTS_UPLOAD',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, viewer.id, 'VIEWER');
      const { accessToken } = await loginAs(viewer.email);

      await uploadPdf(project.id, accessToken).expect(403);
    });

    it('allows a MEMBER with DOCUMENTS_UPLOAD and computes real metadata', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const member = await createUserWithPermissions([
        'DOCUMENTS_UPLOAD',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, member.id, 'MEMBER');
      const { accessToken } = await loginAs(member.email);

      const res = await uploadPdf(project.id, accessToken).expect(201);
      expect(res.body.data.originalName).toBe('Report.pdf');
      expect(res.body.data.mimeType).toBe('application/pdf');
      expect(res.body.data.size).toBe(PDF_BYTES.length);
      expect(res.body.data.uploadedById).toBe(member.id);
      expect(res.body.data.uploadedBy).toEqual({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
      });
      expect(res.body.data.uploadedBy).not.toHaveProperty('email');
      expect(res.body.data.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.data).not.toHaveProperty('storageKey');

      const row = await prisma.document.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(existsSync(storage.resolvePath(row.storageKey))).toBe(true);
    });

    it('rejects a disallowed extension', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('#!/bin/sh\necho hi'), 'script.sh')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it("rejects content whose magic bytes don't match its extension, and does not leave an orphaned file", async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG_BYTES, 'fake.pdf')
        .expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

      const count = await prisma.document.count({
        where: { projectId: project.id },
      });
      expect(count).toBe(0);
    });

    it('rejects a file exceeding the configured size limit', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);
      const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 26214400);
      const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(maxBytes)]);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', oversized, 'big.pdf')
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    }, 30000);

    // Regression coverage for a Phase 10 Codex adversarial review finding:
    // the upload interceptor writes the file to disk before route-param
    // pipes (like ParseUUIDPipe) run, so a rejected invalid :projectId must
    // not leave an orphaned file behind.
    it('does not leave an orphaned file on disk when a downstream pipe rejects the request', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const { accessToken } = await loginAs(manager.email);
      const before = readdirSync(storage.uploadDestination);

      await request(app.getHttpServer())
        .post('/api/v1/projects/not-a-uuid/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PDF_BYTES, 'Report.pdf')
        .expect(400);

      const after = readdirSync(storage.uploadDestination);
      expect(after.length).toBe(before.length);
    });

    // Regression coverage: MAX_UPLOAD_BYTES only bounds the file part;
    // without an explicit `fields`/`parts` cap, multer would buffer
    // unlimited additional text fields into req.body regardless of the
    // file-size limit.
    it('rejects a request carrying extra multipart fields beyond the single expected file part', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('extra', 'should not be accepted')
        .attach('file', PDF_BYTES, 'Report.pdf')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const count = await prisma.document.count({
        where: { projectId: project.id },
      });
      expect(count).toBe(0);
    });
  });

  describe('GET /projects/{projectId}/documents/{documentId}', () => {
    it('never exposes storageKey', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);
      const uploadRes = await uploadPdf(project.id, accessToken).expect(201);

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).not.toHaveProperty('storageKey');
    });

    it('404s for an actor with no visibility into the project', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken: managerToken } = await loginAs(manager.email);
      const uploadRes = await uploadPdf(project.id, managerToken).expect(201);

      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);
      await request(app.getHttpServer())
        .get(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /projects/{projectId}/documents/{documentId}/download', () => {
    it('streams the original content back with a safe Content-Disposition and nosniff', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);
      const uploadRes = await uploadPdf(project.id, accessToken).expect(201);

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}/download`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('Report.pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('re-authorizes on every call: 404s for an actor with no project visibility', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken: managerToken } = await loginAs(manager.email);
      const uploadRes = await uploadPdf(project.id, managerToken).expect(201);

      const outsider = await createUserWithPermissions([]);
      const { accessToken } = await loginAs(outsider.email);
      await request(app.getHttpServer())
        .get(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}/download`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('DELETE /projects/{projectId}/documents/{documentId}', () => {
    it('rejects a non-uploader, non-manager actor', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const uploader = await createUserWithPermissions([
        'DOCUMENTS_UPLOAD',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, uploader.id, 'MEMBER');
      const { accessToken: uploaderToken } = await loginAs(uploader.email);
      const uploadRes = await uploadPdf(project.id, uploaderToken).expect(201);

      const otherMember = await createUserWithPermissions([
        'DOCUMENTS_DELETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, otherMember.id, 'MEMBER');
      const { accessToken } = await loginAs(otherMember.email);

      await request(app.getHttpServer())
        .delete(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows the uploader to delete their own document, removes the physical file, and is idempotent', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      const project = await createProjectDirect(manager.id);
      const uploader = await createUserWithPermissions([
        'DOCUMENTS_UPLOAD',
        'DOCUMENTS_DELETE',
        'PROJECTS_VIEW_ASSIGNED',
      ]);
      await addMemberDirect(project.id, uploader.id, 'MEMBER');
      const { accessToken } = await loginAs(uploader.email);
      const uploadRes = await uploadPdf(project.id, accessToken).expect(201);

      const row = await prisma.document.findUniqueOrThrow({
        where: { id: uploadRes.body.data.id },
      });
      const physicalPath = storage.resolvePath(row.storageKey);
      expect(existsSync(physicalPath)).toBe(true);

      await request(app.getHttpServer())
        .delete(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      expect(existsSync(physicalPath)).toBe(false);

      // Idempotent: a repeat call still succeeds rather than 404ing.
      await request(app.getHttpServer())
        .delete(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(
          `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /projects/{projectId}/documents', () => {
    it('lists metadata and supports search', async () => {
      const manager = await createUserWithPermissions([
        'PROJECTS_CREATE',
        'PROJECTS_VIEW_ASSIGNED',
        'DOCUMENTS_UPLOAD',
      ]);
      const project = await createProjectDirect(manager.id);
      const { accessToken } = await loginAs(manager.email);
      await uploadPdf(project.id, accessToken).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/documents`)
        .query({ search: 'Report' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).not.toHaveProperty('storageKey');
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
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  it('allows the Owner to upload and delete a document in any project without membership', async () => {
    const manager = await createUserWithPermissions([
      'PROJECTS_CREATE',
      'PROJECTS_VIEW_ASSIGNED',
    ]);
    const project = await createProjectDirect(manager.id);

    const uploadRes = await uploadPdf(project.id, ownerAccessToken).expect(201);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/projects/${project.id}/documents/${uploadRes.body.data.id}`,
      )
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(204);
  });
});
