import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Download, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiError } from '@/lib/api-types';
import { formatDateOnly, instantToLocalDay } from '@/lib/dates';
import { formatBytes } from '@/lib/format';
import { canManageInProject, canWriteInProject } from '@/lib/permissions';
import { cn, fullName } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import * as documentsApi from '@/features/documents/api';
import { fileKindOf, FILE_KIND_LABEL } from '@/features/documents/file-kind';
import { FileKindIcon } from '@/features/documents/file-kind-icon';
import { useDeleteDocument, useDocuments } from '@/features/documents/hooks';
import { saveBlob } from '@/features/documents/save-blob';
import { UploadPanel } from '@/features/documents/upload-panel';
import { useDocumentUploads } from '@/features/documents/use-document-uploads';
import type { ProjectDetail, ProjectDocument } from '@/types/domain';

const PAGE_SIZE = 25;

type Ordering = 'recent' | 'oldest' | 'name';

const ORDERINGS: Record<Ordering, { label: string; sort: 'createdAt' | 'originalName'; order: 'asc' | 'desc' }> = {
  recent: { label: 'Más recientes', sort: 'createdAt', order: 'desc' },
  oldest: { label: 'Más antiguos', sort: 'createdAt', order: 'asc' },
  name: { label: 'Nombre (A–Z)', sort: 'originalName', order: 'asc' },
};

function parseOrdering(value: string | null): Ordering {
  return value === 'oldest' || value === 'name' ? value : 'recent';
}

export function ProjectDocumentsPage() {
  const project = useOutletContext<ProjectDetail>();
  const { user, can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [pendingDelete, setPendingDelete] = useState<ProjectDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const ordering = parseOrdering(searchParams.get('order'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const documentsQuery = useDocuments(project.id, {
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: ORDERINGS[ordering].sort,
    order: ORDERINGS[ordering].order,
  });
  const deleteDocument = useDeleteDocument(project.id);
  const uploads = useDocumentUploads(project.id);

  function updateParams(changes: Record<string, string | undefined>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  async function download(document: ProjectDocument) {
    setDownloadingId(document.id);
    try {
      const blob = await documentsApi.downloadDocument(project.id, document.id);
      saveBlob(blob, document.originalName);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      toast.error(
        status === 404
          ? 'El documento ya no existe.'
          : status === 403
            ? 'Ya no tienes acceso a este documento.'
            : 'No se pudo descargar el documento.',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const role = project.viewerCapabilities.role;
  const canUpload = canWriteInProject(can, 'DOCUMENTS_UPLOAD', role);
  const canDelete = (document: ProjectDocument) =>
    canManageInProject(can, 'DOCUMENTS_DELETE', role) ||
    (can('DOCUMENTS_DELETE') && role === 'MEMBER' && document.uploadedById === user?.id);

  const filtered = !!debouncedSearch;

  return (
    <div className="space-y-4">
      {canUpload && (
        <UploadPanel
          items={uploads.items}
          onAddFiles={uploads.addFiles}
          onRetry={uploads.retry}
          onDismiss={uploads.dismiss}
          onDismissMany={uploads.dismissMany}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Buscar documentos"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            updateParams({ search: event.target.value || undefined, page: undefined });
          }}
          className="w-56"
        />
        <Select
          value={ordering}
          onValueChange={(value) => updateParams({ order: value === 'recent' ? undefined : value, page: undefined })}
        >
          <SelectTrigger aria-label="Ordenar documentos" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORDERINGS).map(([value, option]) => (
              <SelectItem key={value} value={value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <QueryState
        query={documentsQuery}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title={filtered ? 'Sin documentos para esta búsqueda' : 'Aún no hay documentos'}
            description={
              filtered
                ? 'Prueba con otro nombre.'
                : canUpload
                  ? 'Sube el primer archivo del proyecto con la zona de arriba.'
                  : 'Los archivos que suba el equipo aparecerán aquí.'
            }
          />
        }
      >
        {(data) => (
          <div className={cn('space-y-3', documentsQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <ul className="space-y-2">
              {data.data.map((document) => {
                const kind = fileKindOf(document.originalName);
                return (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
                  >
                    <FileKindIcon kind={kind} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium">{document.originalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {FILE_KIND_LABEL[kind]} · {formatBytes(document.size)} ·{' '}
                        Subido por {fullName(document.uploadedBy)} ·{' '}
                        {formatDateOnly(instantToLocalDay(document.createdAt))}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={downloadingId === document.id}
                        aria-label={`Descargar ${document.originalName}`}
                        onClick={() => download(document)}
                      >
                        <Download /> Descargar
                      </Button>
                      {canDelete(document) && (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Eliminar ${document.originalName}`}
                          onClick={() => setPendingDelete(document)}
                        >
                          <Trash2 className="text-destructive" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
            />
          </div>
        )}
      </QueryState>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Eliminar documento"
        description={
          <>
            Se eliminará <strong>{pendingDelete?.originalName}</strong> del proyecto y su archivo se borrará del
            almacenamiento. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteDocument.mutateAsync(pendingDelete.id);
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 0;
            toast.error(
              status === 403
                ? 'No tienes permiso para eliminar este documento.'
                : status === 404
                  ? 'El documento ya no existe.'
                  : 'No se pudo eliminar el documento.',
            );
          }
        }}
      />
    </div>
  );
}
