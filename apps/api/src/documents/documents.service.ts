import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  EXTENSION_MIME_MAP,
  extensionOf,
  matchesSignature,
} from '../storage/file-signatures.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { ListDocumentsDto } from './dto/list-documents.dto.js';
import type { Prisma } from '../generated/prisma/client.js';

const MAGIC_BYTES_TO_READ = 16;

// Never includes storageKey — docs/API.md "Devuelve metadata, no la ruta física."
const DOCUMENT_SELECT = {
  id: true,
  projectId: true,
  originalName: true,
  mimeType: true,
  size: true,
  checksumSha256: true,
  uploadedById: true,
  createdAt: true,
} as const;

type DocumentRow = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_SELECT;
}>;

function toPublicShape(document: DocumentRow) {
  // BigInt doesn't serialize to JSON; document sizes fit safely in a Number.
  return { ...document, size: Number(document.size) };
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function sanitizeOriginalName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '_')
    .replace(CONTROL_CHARACTERS, '')
    .trim();
  return cleaned.slice(0, 255) || 'file';
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly access: ProjectAccessService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  /** docs/RBAC.md "Listar/descargar: cualquier usuario con visibilidad del proyecto." */
  async list(
    projectId: string,
    query: ListDocumentsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    await this.access.assertCanViewProject(actor, projectId);

    const where: Prisma.DocumentWhereInput = {
      projectId,
      deletedAt: null,
      project: { deletedAt: null },
      ...(query.search
        ? {
            originalName: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: DOCUMENT_SELECT,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginate(data.map(toPublicShape), total, query.page, query.pageSize);
  }

  async getById(
    projectId: string,
    documentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: DOCUMENT_SELECT,
    });
    if (!document) throw new NotFoundException();
    return toPublicShape(document);
  }

  /**
   * docs/API.md: "El backend hace streaming, valida límites, calcula
   * metadata y sólo confirma la fila cuando storage y transacción quedan
   * coherentes." The file is already on disk by the time this runs (the
   * upload interceptor wrote it); every failure path below deletes it so a
   * rejected/failed upload never leaves an orphaned file with no DB row.
   */
  async create(
    projectId: string,
    file: Express.Multer.File | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('A file is required.');
    try {
      await this.access.assertCanViewProject(actor, projectId);
      if (
        !(await this.access.hasMemberLevelAccess(
          actor,
          projectId,
          'DOCUMENTS_UPLOAD',
        ))
      ) {
        throw new ForbiddenException();
      }

      // The extension allowlist was already enforced by the upload
      // interceptor's fileFilter; re-deriving the canonical MIME here (never
      // the client's declared Content-Type) keeps this the single source of
      // truth for what gets persisted — docs/SECURITY.md "No confiar sólo en
      // filename o MIME del cliente."
      const extension = extensionOf(file.originalname);
      const canonicalMimeType = EXTENSION_MIME_MAP[extension];

      const head = await this.storage.readHead(
        file.filename,
        MAGIC_BYTES_TO_READ,
      );
      if (!matchesSignature(extension, head)) {
        throw new UnsupportedMediaTypeException(
          "The file's content doesn't match its extension.",
        );
      }

      const checksumSha256 = await this.computeChecksum(file.filename);

      const document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            projectId,
            originalName: sanitizeOriginalName(file.originalname),
            storageKey: file.filename,
            mimeType: canonicalMimeType,
            size: BigInt(file.size),
            checksumSha256,
            uploadedById: actor.id,
          },
          select: DOCUMENT_SELECT,
        });
        await this.audit.logInTransaction(tx, {
          actorId: actor.id,
          action: 'DOCUMENT_UPLOADED',
          entityType: 'Document',
          entityId: created.id,
          metadata: { projectId },
        });
        return created;
      });
      await this.activity.record({
        projectId,
        actorId: actor.id,
        type: 'DOCUMENT_UPLOADED',
        entityType: 'Document',
        entityId: document.id,
        metadata: {
          originalName: document.originalName,
          mimeType: document.mimeType,
        },
      });
      return toPublicShape(document);
    } catch (error) {
      await this.storage.deleteIfExists(file.filename);
      throw error;
    }
  }

  /**
   * docs/RBAC.md "Toda descarga vuelve a comprobar acceso; conocer
   * storageKey o URL no concede autorización." Every call re-runs the full
   * visibility check from scratch — nothing about a download is cached or
   * pre-authorized.
   */
  async download(
    projectId: string,
    documentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: { originalName: true, mimeType: true, storageKey: true },
    });
    if (!document) throw new NotFoundException();
    return {
      stream: this.storage.createReadStream(document.storageKey),
      originalName: document.originalName,
      mimeType: document.mimeType,
    };
  }

  /** docs/API.md "Operación idempotente con baja lógica y eliminación del objeto reintentable." */
  async delete(
    projectId: string,
    documentId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.access.assertCanViewProject(actor, projectId);
    // Deliberately not filtering deletedAt: null here — a repeat call on an
    // already-deleted document must still succeed idempotently rather than 404.
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, projectId },
    });
    if (!document) throw new NotFoundException();
    if (!(await this.canManageDocument(actor, document, projectId)))
      throw new ForbiddenException();

    if (!document.deletedAt) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.document.updateMany({
          where: { id: documentId, projectId, deletedAt: null },
          data: { deletedAt: new Date(), deletedById: actor.id },
        });
        if (count > 0)
          await this.audit.logInTransaction(tx, {
            actorId: actor.id,
            action: 'DOCUMENT_DELETED',
            entityType: 'Document',
            entityId: documentId,
            metadata: { projectId },
          });
        return count > 0;
      });
      // Only recorded on the genuine transition, not a repeat idempotent call.
      if (changed)
        await this.activity.record({
          projectId,
          actorId: actor.id,
          type: 'DOCUMENT_DELETED',
          entityType: 'Document',
          entityId: documentId,
        });
    }
    // Retryable regardless of whether this call performed the soft-delete or
    // a previous one already did.
    await this.storage.deleteIfExists(document.storageKey);
  }

  /** docs/RBAC.md "Eliminar: DOCUMENTS_DELETE y ser uploader, MANAGER u override." */
  private async canManageDocument(
    actor: AuthenticatedUser,
    document: { uploadedById: string },
    projectId: string,
  ): Promise<boolean> {
    if (actor.isOwner) return true;

    const keys = await this.effectivePermissions.getEffectivePermissionKeys(
      actor.id,
    );
    if (!keys.has('DOCUMENTS_DELETE')) return false;
    if (keys.has('PROJECTS_VIEW_ALL')) return true;
    const membership = await this.access.getActiveMembership(
      actor.id,
      projectId,
    );
    return (
      membership?.role === 'MANAGER' ||
      (membership?.role === 'MEMBER' && document.uploadedById === actor.id)
    );
  }

  private async computeChecksum(storageKey: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = this.storage.createReadStream(storageKey);
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }
}
