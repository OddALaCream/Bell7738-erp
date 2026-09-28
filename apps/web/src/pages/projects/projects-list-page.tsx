import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDateOnly } from '@/lib/dates';
import { useProjects } from '@/features/projects/hooks';
import { ProjectStatusBadge } from '@/features/projects/status-badge';
import { ProjectFormDialog } from '@/features/projects/project-form-dialog';
import type { ListProjectsParams } from '@/features/projects/api';

const VIEWS: Array<{ value: NonNullable<ListProjectsParams['view']> | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'completed', label: 'Finalizados' },
  { value: 'paused', label: 'Pausados' },
  { value: 'endingSoon', label: 'Próximos a terminar' },
  { value: 'overdue', label: 'Atrasados' },
];

export function ProjectsListPage() {
  useSetBreadcrumb('Proyectos');
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const view = (searchParams.get('view') as ListProjectsParams['view'] | null) ?? undefined;
  const sort = (searchParams.get('sort') as ListProjectsParams['sort'] | null) ?? 'createdAt';
  const [createOpen, setCreateOpen] = useState(false);

  const query = useProjects({ search: debouncedSearch || undefined, view, sort, pageSize: 50 });

  function updateFilter(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Proyectos</h1>
          <p className="text-sm text-muted-foreground">Organiza el trabajo por proyecto.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Crear proyecto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por nombre o cliente…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            updateFilter('search', e.target.value || undefined);
          }}
          className="max-w-xs"
        />
        <Select value={view ?? 'all'} onValueChange={(v) => updateFilter('view', v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEWS.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => updateFilter('sort', v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Creación</SelectItem>
            <SelectItem value="startDate">Inicio</SelectItem>
            <SelectItem value="expectedEndDate">Fin esperado</SelectItem>
            <SelectItem value="name">Nombre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <QueryState
        query={query}
        skeleton={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={FolderKanban}
            title={debouncedSearch || view ? 'Sin resultados' : 'Aún no hay proyectos'}
            description={
              debouncedSearch || view ? 'Prueba con otros filtros.' : 'Crea el primer proyecto para empezar.'
            }
          />
        }
      >
        {(data) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.data.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}/overview`} className="block rounded-lg">
                <Card className="h-full transition-colors hover:bg-accent">
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{project.name}</p>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    {project.clientName && <p className="text-sm text-muted-foreground">{project.clientName}</p>}
                    <p className="text-xs text-muted-foreground">
                      {project.startDate ? formatDateOnly(project.startDate) : 'Sin inicio'} —{' '}
                      {project.expectedEndDate ? formatDateOnly(project.expectedEndDate) : 'sin fecha límite'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </QueryState>

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
