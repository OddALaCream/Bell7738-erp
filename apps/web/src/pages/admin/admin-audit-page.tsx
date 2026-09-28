import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { QueryState } from '@/components/common/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { endOfLocalDayIso, formatDateTime, startOfLocalDayIso } from '@/lib/dates';
import { cn, fullName } from '@/lib/utils';
import { usePeople } from '@/features/activity/hooks';
import { AUDIT_ACTIONS, type AuditAction, type AuditLogEntry } from '@/features/audit/api';
import { useAuditLog } from '@/features/audit/hooks';
import { AUDIT_ACTION_LABEL } from '@/features/audit/labels';
import { useTeam } from '@/features/users/hooks';

const PAGE_SIZE = 25;

function parseAction(value: string | null): AuditAction | undefined {
  return AUDIT_ACTIONS.find((action) => action === value);
}

/** docs/UI-UX.md "Auditoría": read-only, filters by actor/action/entity/date, detail in a drawer. */
export function AdminAuditPage() {
  useSetBreadcrumb('Administración / Auditoría');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [entityInput, setEntityInput] = useState(searchParams.get('entityType') ?? '');
  const debouncedEntity = useDebouncedValue(entityInput.trim(), 300);

  const action = parseAction(searchParams.get('action'));
  const actorId = searchParams.get('actorId') ?? undefined;
  const fromDate = searchParams.get('from') ?? undefined;
  const toDate = searchParams.get('to') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const query = useAuditLog({
    action,
    actorId,
    entityType: debouncedEntity || undefined,
    from: fromDate ? startOfLocalDayIso(fromDate) : undefined,
    to: toDate ? endOfLocalDayIso(toDate) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Audit rows only carry the actor's id; names come from the active-team directory.
  const team = useTeam({ pageSize: 100 });
  const { nameOf } = usePeople();
  const actorName = (id: string | null) => (id === null ? 'Sistema' : nameOf(id));

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

  const filtered = !!(action || actorId || debouncedEntity || fromDate || toDate);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Registro de sólo lectura de operaciones administrativas sensibles.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Acción</Label>
          <Select value={action ?? 'ALL'} onValueChange={(value) => updateParams({ action: value === 'ALL' ? undefined : value, page: undefined })}>
            <SelectTrigger id="audit-action" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las acciones</SelectItem>
              {AUDIT_ACTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIT_ACTION_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-actor">Persona</Label>
          <Select value={actorId ?? 'ALL'} onValueChange={(value) => updateParams({ actorId: value === 'ALL' ? undefined : value, page: undefined })}>
            <SelectTrigger id="audit-actor" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las personas</SelectItem>
              {(team.data?.data ?? []).map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {fullName(member)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-entity">Tipo de entidad</Label>
          <Input
            id="audit-entity"
            placeholder="User, Role…"
            value={entityInput}
            onChange={(event) => {
              setEntityInput(event.target.value);
              updateParams({ entityType: event.target.value.trim() || undefined, page: undefined });
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">Desde</Label>
          <Input
            id="audit-from"
            type="date"
            value={fromDate ?? ''}
            max={toDate}
            onChange={(event) => updateParams({ from: event.target.value || undefined, page: undefined })}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">Hasta</Label>
          <Input
            id="audit-to"
            type="date"
            value={toDate ?? ''}
            min={fromDate}
            onChange={(event) => updateParams({ to: event.target.value || undefined, page: undefined })}
            className="w-40"
          />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEntityInput('');
              updateParams({ action: undefined, actorId: undefined, entityType: undefined, from: undefined, to: undefined, page: undefined });
            }}
          >
            Restablecer filtros
          </Button>
        )}
      </div>

      <QueryState
        query={query}
        skeleton={<Skeleton className="h-64 w-full" />}
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'Sin eventos para estos filtros' : 'Aún no hay eventos de auditoría'}
            description={filtered ? 'Prueba con otro rango de fechas, acción o persona.' : undefined}
          />
        }
      >
        {(data) => (
          <div className={cn('space-y-3', query.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Acción</TableHead>
                    <TableHead className="hidden sm:table-cell">Persona</TableHead>
                    <TableHead className="hidden md:table-cell">Entidad</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelected(entry)}
                          className="rounded-md text-left"
                          aria-label={`Ver detalle: ${AUDIT_ACTION_LABEL[entry.action] ?? entry.action}, ${formatDateTime(entry.createdAt)}`}
                        >
                          <Badge variant="outline">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{actorName(entry.actorId)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{entry.entityType ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
            />
          </div>
        )}
      </QueryState>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalle del evento</SheetTitle>
            <SheetDescription>Registro de sólo lectura; los datos sensibles ya vienen omitidos por el servidor.</SheetDescription>
          </SheetHeader>
          {selected && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Acción</dt>
                <dd>
                  {AUDIT_ACTION_LABEL[selected.action] ?? selected.action}{' '}
                  <span className="font-mono text-xs text-muted-foreground">({selected.action})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Persona</dt>
                <dd>
                  {actorName(selected.actorId)}
                  {selected.actorId && <span className="ml-1 break-all font-mono text-xs text-muted-foreground">({selected.actorId})</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Entidad</dt>
                <dd>
                  {selected.entityType ?? '—'}
                  {selected.entityId && <span className="ml-1 break-all font-mono text-xs">({selected.entityId})</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Fecha</dt>
                <dd>{formatDateTime(selected.createdAt)}</dd>
              </div>
              {selected.ip && (
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{selected.ip}</dd>
                </div>
              )}
              {selected.requestId && (
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">ID de petición</dt>
                  <dd className="break-all font-mono text-xs">{selected.requestId}</dd>
                </div>
              )}
              {selected.metadata && (
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Metadata</dt>
                  <dd>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
