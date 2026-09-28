import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { AUDIT_ACTIONS, type AuditAction, type AuditLogEntry } from '@/features/audit/api';
import { useAuditLog } from '@/features/audit/hooks';

export function AdminAuditPage() {
  useSetBreadcrumb('Administración / Auditoría');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const action = (searchParams.get('action') as AuditAction | null) ?? undefined;
  const entityType = searchParams.get('entityType') ?? undefined;
  const actorId = searchParams.get('actorId') ?? undefined;

  const query = useAuditLog({ action, entityType, actorId, pageSize: 50 });

  function updateFilter(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Registro de sólo lectura de operaciones administrativas sensibles.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Acción</Label>
          <Select value={action ?? 'ALL'} onValueChange={(v) => updateFilter('action', v === 'ALL' ? undefined : v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las acciones</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entityType">Tipo de entidad</Label>
          <Input
            id="entityType"
            placeholder="User, Role…"
            defaultValue={entityType}
            onBlur={(e) => updateFilter('entityType', e.target.value || undefined)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actorId">ID de actor</Label>
          <Input
            id="actorId"
            placeholder="UUID"
            defaultValue={actorId}
            onBlur={(e) => updateFilter('actorId', e.target.value || undefined)}
            className="w-56"
          />
        </div>
      </div>

      <QueryState
        query={query}
        emptyWhen={(data) => data.data.length === 0}
        empty={<EmptyState icon={ScrollText} title="Sin eventos para estos filtros" />}
      >
        {(data) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acción</TableHead>
                  <TableHead className="hidden sm:table-cell">Entidad</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((entry) => (
                  <TableRow key={entry.id} className="cursor-pointer" onClick={() => setSelected(entry)}>
                    <TableCell>
                      <Badge variant="outline">{entry.action}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {entry.entityType ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalle del evento</SheetTitle>
          </SheetHeader>
          {selected && (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Acción</dt>
                <dd>{selected.action}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Actor</dt>
                <dd className="break-all font-mono text-xs">{selected.actorId ?? 'Sistema'}</dd>
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
                <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              </div>
              {selected.ip && (
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{selected.ip}</dd>
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
