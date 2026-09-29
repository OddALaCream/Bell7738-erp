import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectDetail } from '@/types/domain';

export function ProjectOverviewPage() {
  const project = useOutletContext<ProjectDetail>();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Descripción</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {project.description || 'Sin descripción.'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tu rol en este proyecto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Rol local: {project.viewerCapabilities.role ?? 'Sin membresía (acceso por permiso global)'}</p>
          <p>Puede editar: {project.viewerCapabilities.canUpdate ? 'Sí' : 'No'}</p>
          <p>Puede eliminar: {project.viewerCapabilities.canDelete ? 'Sí' : 'No'}</p>
          <p>Puede administrar miembros: {project.viewerCapabilities.canManageMembers ? 'Sí' : 'No'}</p>
        </CardContent>
      </Card>
    </div>
  );
}
