import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FolderKanban, Info, ListTodo } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { ProjectStatusBadge } from '@/features/projects/status-badge';
import { formatDateOnly } from '@/lib/dates';
import { cn, fullName } from '@/lib/utils';
import type { ProjectStatus, TaskStatus } from '@/types/domain';

export interface ProfileProject {
  id: string;
  name: string;
  status: ProjectStatus;
}

export interface ProfileTask {
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
}

/** What the four cards show; the page decides where each list comes from. */
export interface ProfileContent {
  roles: string[];
  activeProjects: ProfileProject[];
  pastProjects: ProfileProject[];
  activeTasks: ProfileTask[];
  completedTasks: ProfileTask[];
}

export type SectionState = 'ready' | 'loading' | 'error';

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
            <span className="truncate">{project.name}</span>
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
              <span className={cn('truncate', done && 'text-muted-foreground line-through')}>
                {done && <span className="sr-only">Terminada: </span>}
                {task.title}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDateOnly(task.dueDate, { day: 'numeric', month: 'short' })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileCard({
  title,
  icon: Icon,
  state,
  children,
}: {
  title: string;
  icon?: typeof ListTodo;
  state: SectionState;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-sm font-semibold leading-none">
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />} {title}
        </h2>
      </CardHeader>
      <CardContent>
        {state === 'loading' ? (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : state === 'error' ? (
          <p role="alert" className="py-4 text-sm text-muted-foreground">
            No se pudo cargar esta sección.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/**
 * docs/UI-UX.md "Perfil": avatar, name, email, roles, projects (active and
 * previous) and tasks (active and finished). `note` explains data the server
 * can't provide yet, instead of presenting it as an empty state.
 */
export function ProfileView({
  profile,
  content,
  tasksState = 'ready',
  projectsState = 'ready',
  note,
  children,
}: {
  profile: { firstName: string; lastName: string; email: string };
  content: ProfileContent;
  tasksState?: SectionState;
  projectsState?: SectionState;
  note?: string;
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

      <div className="flex flex-wrap items-center gap-1.5">
        {content.roles.length > 0 ? (
          content.roles.map((role) => <Badge key={role}>{role}</Badge>)
        ) : (
          <p className="text-sm text-muted-foreground">Los roles todavía no se muestran en el perfil.</p>
        )}
      </div>

      {note && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {note}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProfileCard title="Proyectos activos" icon={FolderKanban} state={projectsState}>
          <ProjectList projects={content.activeProjects} empty="Sin proyectos activos" />
        </ProfileCard>
        <ProfileCard title="Tareas activas" icon={ListTodo} state={tasksState}>
          <TaskList tasks={content.activeTasks} empty="Sin tareas activas" />
        </ProfileCard>
        <ProfileCard title="Proyectos anteriores" state={projectsState}>
          <ProjectList projects={content.pastProjects} empty="Sin proyectos anteriores" />
        </ProfileCard>
        <ProfileCard title="Tareas terminadas" state={tasksState}>
          <TaskList tasks={content.completedTasks} empty="Sin tareas terminadas" done />
        </ProfileCard>
      </div>
    </div>
  );
}
