import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FolderKanban, ListTodo } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, RoleBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { PROJECT_ROLE_LABEL } from '@/features/projects/labels';
import { ProjectStatusBadge } from '@/features/projects/status-badge';
import type { ProfileExtras, ProfileProject, ProfileTask } from './api';
import { formatDateOnly } from '@/lib/dates';
import { cn, fullName } from '@/lib/utils';

/** What the four cards and the role badges show: the server's lists as they are. */
export type ProfileContent = ProfileExtras;

function ProjectList({ projects, empty }: { projects: ProfileProject[]; empty: string }) {
  if (projects.length === 0) return <EmptyState title={empty} className="border-none py-6" />;
  return (
    <ul className="space-y-1">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            to={`/projects/${project.id}/overview`}
            className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent"
          >
            <span className="min-w-0">
              <span className="block truncate">{project.name}</span>
              <span className="block text-xs text-muted-foreground">{PROJECT_ROLE_LABEL[project.role]}</span>
            </span>
            <ProjectStatusBadge status={project.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TaskList({ tasks, empty, done }: { tasks: ProfileTask[]; empty: string; done?: boolean }) {
  if (tasks.length === 0) return <EmptyState title={empty} className="border-none py-6" />;
  return (
    <ul className="space-y-1">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link
            to={`/projects/${task.projectId}/tasks?taskId=${task.id}`}
            className={cn('flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent', done && 'opacity-60')}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {done && <CheckCircle2 className="size-3.5 shrink-0 text-brand-600" aria-hidden="true" />}
              <span className="min-w-0">
                <span className={cn('block truncate', done && 'text-muted-foreground line-through')}>
                  {done && <span className="sr-only">Terminada: </span>}
                  {task.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{task.projectName}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDateOnly(task.dueDate, { day: 'numeric', month: 'short' })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileCard({ title, icon: Icon, children }: { title: string; icon?: typeof ListTodo; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-sm font-semibold leading-none">
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />} {title}
        </h2>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * docs/UI-UX.md "Perfil": avatar, name, email, roles, projects (active and
 * previous) and tasks (active and finished), exactly as the API reports them
 * for this observer — an empty list means there is nothing visible to show.
 */
export function ProfileView({
  profile,
  content,
  isOwner = false,
  children,
}: {
  profile: { firstName: string; lastName: string; email: string };
  content: ProfileContent;
  /** Only known for your own profile; the directory never reveals who the Owner is. */
  isOwner?: boolean;
  children?: ReactNode;
}) {
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

      {(isOwner || content.roles.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Roles">
          {isOwner && <Badge>Owner</Badge>}
          {content.roles.map((role) => (
            <RoleBadge key={role.id} name={role.name} color={role.color} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProfileCard title="Proyectos activos" icon={FolderKanban}>
          <ProjectList projects={content.activeProjects} empty="Sin proyectos activos" />
        </ProfileCard>
        <ProfileCard title="Tareas activas" icon={ListTodo}>
          <TaskList tasks={content.activeTasks} empty="Sin tareas activas" />
        </ProfileCard>
        <ProfileCard title="Proyectos anteriores">
          <ProjectList projects={content.pastProjects} empty="Sin proyectos anteriores" />
        </ProfileCard>
        <ProfileCard title="Tareas terminadas">
          <TaskList tasks={content.completedTasks} empty="Sin tareas terminadas" done />
        </ProfileCard>
      </div>
    </div>
  );
}
