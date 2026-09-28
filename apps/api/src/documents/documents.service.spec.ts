import {
  ForbiddenException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { DocumentsService } from './documents.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's2',
};

const baseDocument = {
  id: 'doc-1',
  projectId: 'proj-1',
  originalName: 'Report.pdf',
  storageKey: 'storage-key-1',
  mimeType: 'application/pdf',
  size: 1234n,
  checksumSha256: 'abc123',
  uploadedById: 'uploader-1',
  createdAt: new Date(),
  deletedAt: null as Date | null,
};

const pdfFile = {
  filename: 'storage-key-1',
  originalname: 'Report.pdf',
  size: 1234,
} as Express.Multer.File;

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  membership?: { role: 'MANAGER' | 'MEMBER' | 'VIEWER' } | null;
  hasMemberLevelAccess?: boolean;
  document?: unknown;
  head?: Buffer;
}) {
  const prisma = {
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides?.document !== undefined ? overrides.document : baseDocument,
        ),
      create: vi.fn().mockResolvedValue(baseDocument),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
  } as unknown as EffectivePermissionsService;

  const access = {
    assertCanViewProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getActiveMembership: vi
      .fn()
      .mockResolvedValue(
        overrides?.membership !== undefined ? overrides.membership : null,
      ),
    hasMemberLevelAccess: vi
      .fn()
      .mockResolvedValue(overrides?.hasMemberLevelAccess ?? true),
  } as unknown as ProjectAccessService;

  const storage = {
    readHead: vi
      .fn()
      .mockResolvedValue(overrides?.head ?? Buffer.from('%PDF-1.7')),
    deleteIfExists: vi.fn().mockResolvedValue(undefined),
    createReadStream: vi
      .fn()
      .mockReturnValue(Readable.from([Buffer.from('file content')])),
  } as unknown as StorageService;

  const activity = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as ActivityService;

  return {
    service: new DocumentsService(
      prisma,
      effectivePermissions,
      access,
      storage,
      activity,
    ),
    prisma,
    access,
    storage,
    activity,
  };
}

describe('DocumentsService.create', () => {
  it('rejects when the actor lacks member-level access (DOCUMENTS_UPLOAD + MEMBER/MANAGER/override)', async () => {
    const { service, storage } = makeService({ hasMemberLevelAccess: false });
    await expect(
      service.create('proj-1', pdfFile, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.deleteIfExists).toHaveBeenCalledWith(pdfFile.filename);
  });

  it('rejects and cleans up the file when the content does not match its extension', async () => {
    const { service, storage } = makeService({
      head: Buffer.from('not a pdf'),
    });
    await expect(
      service.create('proj-1', pdfFile, actor),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(storage.deleteIfExists).toHaveBeenCalledWith(pdfFile.filename);
  });

  it('stores the canonical MIME type derived from the extension, not any client-declared value', async () => {
    const { service, prisma } = makeService();
    await service.create('proj-1', pdfFile, actor);
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mimeType: 'application/pdf' }),
      }),
    );
  });

  it('sanitizes path separators and control characters out of the stored originalName', async () => {
    const { service, prisma } = makeService();
    await service.create(
      'proj-1',
      { ...pdfFile, originalname: '../../etc/passwd.pdf' },
      actor,
    );
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ originalName: '.._.._etc_passwd.pdf' }),
      }),
    );
  });

  it('returns size as a Number, not a BigInt (which does not JSON-serialize)', async () => {
    const result = await makeService().service.create('proj-1', pdfFile, actor);
    expect(result.size).toBe(1234);
    expect(typeof result.size).toBe('number');
  });

  it('cleans up the file if the DB write itself fails', async () => {
    const { service, prisma, storage } = makeService();
    (prisma.document.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    );
    await expect(service.create('proj-1', pdfFile, actor)).rejects.toThrow(
      'db down',
    );
    expect(storage.deleteIfExists).toHaveBeenCalledWith(pdfFile.filename);
  });

  it('allows the Owner unconditionally', async () => {
    const { service } = makeService();
    await expect(
      service.create('proj-1', pdfFile, owner),
    ).resolves.toBeDefined();
  });
});

describe('DocumentsService.getById / list', () => {
  // storageKey exclusion itself is enforced by DOCUMENT_SELECT against real
  // Prisma (a plain mock doesn't honor `select` projections, so asserting it
  // here would only test the mock's fidelity) — verified in the e2e suite
  // against the real database instead.

  it('requires visibility of the project before listing', async () => {
    const { service, access } = makeService();
    await service.list(
      'proj-1',
      { page: 1, pageSize: 25, sort: 'createdAt', order: 'desc' },
      actor,
    );
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('404s on a nonexistent or invisible document', async () => {
    const { service } = makeService({ document: null });
    await expect(
      service.getById('proj-1', 'missing', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DocumentsService.download', () => {
  it('re-runs the full visibility check on every call (no caching)', async () => {
    const { service, access } = makeService();
    await service.download('proj-1', 'doc-1', actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('404s on a nonexistent or invisible document', async () => {
    const { service } = makeService({ document: null });
    await expect(
      service.download('proj-1', 'missing', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('streams from the storage-resolved path, not any client-supplied value', async () => {
    const { service, storage } = makeService();
    await service.download('proj-1', 'doc-1', actor);
    expect(storage.createReadStream).toHaveBeenCalledWith(
      baseDocument.storageKey,
    );
  });
});

describe('DocumentsService.delete', () => {
  it('rejects a non-uploader, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['DOCUMENTS_DELETE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.delete('proj-1', 'doc-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the uploader with DOCUMENTS_DELETE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['DOCUMENTS_DELETE']),
      document: { ...baseDocument, uploadedById: actor.id },
    });
    await expect(
      service.delete('proj-1', 'doc-1', actor),
    ).resolves.toBeUndefined();
  });

  it('allows a MANAGER with DOCUMENTS_DELETE even if not the uploader', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['DOCUMENTS_DELETE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.delete('proj-1', 'doc-1', actor),
    ).resolves.toBeUndefined();
  });

  it('404s on a nonexistent document', async () => {
    const { service } = makeService({ document: null });
    await expect(
      service.delete('proj-1', 'missing', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent: a second delete on an already-deleted document still succeeds and retries file cleanup', async () => {
    const { service, prisma, storage } = makeService({
      effectiveKeys: new Set(['DOCUMENTS_DELETE']),
      membership: { role: 'MANAGER' },
      document: { ...baseDocument, deletedAt: new Date('2026-01-01') },
    });
    await expect(
      service.delete('proj-1', 'doc-1', actor),
    ).resolves.toBeUndefined();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(storage.deleteIfExists).toHaveBeenCalledWith(
      baseDocument.storageKey,
    );
  });
});
