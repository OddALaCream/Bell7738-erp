import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { ListAuditDto } from './dto/list-audit.dto.js';
import type { AuditAction } from './audit-actions.js';
import type { AuditContext } from './audit-context.decorator.js';
import type { Prisma } from '../generated/prisma/client.js';

const AUDIT_SELECT = {
  id: true,
  actorId: true,
  action: true,
  entityType: true,
  entityId: true,
  requestId: true,
  ip: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
} as const;

export interface WriteAuditLogInput {
  actorId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** docs/RBAC.md "Sólo Owner o AUDIT_VIEW." Enforced by the controller's guard; this is read-only, no update/delete exist. */
  async list(query: ListAuditDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, query.page, query.pageSize);
  }

  async getById(auditId: string) {
    const entry = await this.prisma.auditLog.findUnique({
      where: { id: auditId },
      select: AUDIT_SELECT,
    });
    if (!entry) throw new NotFoundException();
    return entry;
  }

  private toCreateData(
    input: WriteAuditLogInput,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.context?.requestId,
      ip: input.context?.ip,
      // Defensively truncated to the column's varchar(512) limit — an
      // oversized User-Agent header must never be able to fail the write
      // (see logInTransaction's atomicity note below).
      userAgent: input.context?.userAgent?.slice(0, 512),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  /**
   * docs/DATABASE.md: "No se guardan secretos, hashes de contraseña,
   * tokens, cookies, contenido completo de documentos ni notas completas."
   * Callers must only ever pass already-redacted, minimal metadata — this
   * method does not sanitize its input, it trusts the caller. Best-effort,
   * like ActivityService/NotificationsService: a logging failure must never
   * fail the primary operation it's attached to. Only appropriate for
   * non-critical events; see logInTransaction for security/administration
   * actions, which docs/ARCHITECTURE.md requires to commit atomically with
   * the business change they record.
   */
  async log(input: WriteAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toCreateData(input) });
    } catch (error) {
      this.logger.warn(
        `Failed to write audit log for action ${input.action}: ${String(error)}`,
      );
    }
  }

  /**
   * docs/ARCHITECTURE.md "Eventos internos, actividad y auditoría": "Para
   * cambios críticos, el registro de negocio y su evento durable se escriben
   * en la misma transacción." Every AuditLog write in this codebase is for a
   * security/administration action, so this is the method callers should
   * use, passing the same `tx` as the primary mutation — a write failure
   * here propagates and rolls back the whole transaction, rather than
   * silently letting the mutation succeed with no audit trail.
   */
  async logInTransaction(
    tx: Prisma.TransactionClient,
    input: WriteAuditLogInput,
  ): Promise<void> {
    await tx.auditLog.create({ data: this.toCreateData(input) });
  }
}
