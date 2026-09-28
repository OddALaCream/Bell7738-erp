import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateOnly } from '@/lib/dates';
import { useProject, useDeleteProject } from '@/features/projects/hooks';
import { ProjectStatusBadge } from '@/features/projects/status-badge';
import { ProjectFormDialog } from '@/features/projects/project-form-dialog';

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'tasks', label: 'Tareas' },
  { to: 'timeline', label: 'Cronograma' },
  { to: 'calendar', label: 'Calendario' },
  { to: 'meetings', label: 'Reuniones' },
  { to: 'documents', label: 'Documentos' },
  { to: 'members', label: 'Miembros' },
  { to: 'activity', label: 'Actividad' },
];

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const projectQuery = useProject(projectId);
  const deleteProject = useDeleteProject();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useSetBreadcrumb(projectQuery.data ? `Proyectos / ${projectQuery.data.name}` : 'Proyectos');

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <QueryState query={projectQuery}>
        {(project) => (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold">{project.name}</h1>
                  <ProjectStatusBadge status={project.status} />
                </div>
                {project.clientName && <p className="text-sm text-muted-foreground">Cliente: {project.clientName}</p>}
                <p className="text-xs text-muted-foreground">
                  {project.startDate ? formatDateOnly(project.startDate) : 'Sin inicio'} —{' '}
                  {project.expectedEndDate ? formatDateOnly(project.expectedEndDate) : 'sin fecha límite'}
                </p>
              </div>
              <div className="flex gap-2">
                {project.viewerCapabilities.canUpdate && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil /> Editar
                  </Button>
                )}
                {project.viewerCapabilities.canDelete && (
                  <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
                    <Trash2 className="text-destructive" /> Eliminar
                  </Button>
                )}
              </div>
            </div>

            <nav className="-mx-1 overflow-x-auto">
              <ul className="flex min-w-max gap-1 border-b border-border px-1">
                {TABS.map((tab) => (
                  <li key={tab.to}>
                    <NavLink
                      to={tab.to}
                      className={({ isActive }) =>
                        cn(
                          'block touch-target border-b-2 px-3 py-2 text-sm font-medium',
                          isActive
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )
                      }
                    >
                      {tab.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <Outlet context={project} />

            <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} />

            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title="Eliminar proyecto"
              description={
                <>
                  Se dará de baja el proyecto <strong>{project.name}</strong>. Sus tareas, reuniones y documentos
                  dejarán de ser accesibles para el equipo, pero el historial se conserva.
                </>
              }
              confirmLabel="Eliminar"
              variant="destructive"
              onConfirm={async () => {
                await deleteProject.mutateAsync(project.id);
                navigate('/projects');
              }}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}
