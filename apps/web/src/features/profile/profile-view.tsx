import { FolderKanban, ListTodo } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { ProjectStatusBadge } from '@/features/projects/status-badge';
import { fullName } from '@/lib/utils';
import type { OwnProfile, PublicProfile } from './api';

/**
 * Renders roles/activeProjects/pastProjects/activeTasks/completedTasks even
 * though the backend currently always sends them empty — see
 * docs/FRONTEND_BACKEND_GAPS.md. Once populated server-side this view works
 * without changes.
 */
export function ProfileView({ profile, children }: { profile: OwnProfile | PublicProfile; children?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <UserAvatar firstName={profile.firstName} lastName={profile.lastName} className="size-16 text-lg" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{fullName(profile)}</h1>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
        </div>
      </div>

      {children}

      <div className="flex flex-wrap gap-1.5">
        {profile.roles.length > 0 ? (
          profile.roles.map((role) => <Badge key={role}>{role}</Badge>)
        ) : (
          <p className="text-sm text-muted-foreground">Sin roles asignados.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderKanban className="size-4" /> Proyectos activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.activeProjects.length === 0 ? (
              <EmptyState title="Sin proyectos activos" className="border-none py-6" />
            ) : (
              <ul className="space-y-2">
                {profile.activeProjects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{project.name}</span>
                    <ProjectStatusBadge status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListTodo className="size-4" /> Tareas activas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.activeTasks.length === 0 ? (
              <EmptyState title="Sin tareas activas" className="border-none py-6" />
            ) : (
              <ul className="space-y-2">
                {profile.activeTasks.map((task) => (
                  <li key={task.id} className="truncate text-sm">
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Proyectos anteriores</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.pastProjects.length === 0 ? (
              <EmptyState title="Sin proyectos anteriores" className="border-none py-6" />
            ) : (
              <ul className="space-y-2">
                {profile.pastProjects.map((project) => (
                  <li key={project.id} className="truncate text-sm">
                    {project.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tareas terminadas</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.completedTasks.length === 0 ? (
              <EmptyState title="Sin tareas terminadas" className="border-none py-6" />
            ) : (
              <ul className="space-y-2">
                {profile.completedTasks.map((task) => (
                  <li key={task.id} className="truncate text-sm text-muted-foreground line-through">
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
