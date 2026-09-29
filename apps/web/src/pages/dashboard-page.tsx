import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, FolderKanban, History, ListTodo, Users } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { useNow } from '@/hooks/use-now';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/query-state';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateOnly, formatTime, instantToLocalDay, isBeforeToday, todayDateOnly } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import { ActivityFeed } from '@/features/activity/activity-feed';
import { usePeople } from '@/features/activity/hooks';
import { useAuth } from '@/features/auth/auth-context';
import { DashboardSection } from '@/features/dashboard/dashboard-section';
import {
  DASHBOARD_PROJECT_LIMIT,
  useDashboardActivity,
  useDashboardMeetings,
  useDashboardProjects,
  useDashboardTasks,
  useDashboardTeam,
} from '@/features/dashboard/hooks';
import { nextMeetings, prioritizeTasks } from '@/features/dashboard/logic';
import { useProjectNames } from '@/features/projects/hooks';
import { ProjectStatusBadge } from '@/features/projects/status-badge';

const TASK_LIMIT = 6;
const MEETING_LIMIT = 5;

function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

const rowClass = 'flex items-center gap-3 rounded-md px-1 py-2 text-sm hover:bg-accent';

export function DashboardPage() {
  useSetBreadcrumb('Dashboard');
  const { user } = useAuth();
  const projectNames = useProjectNames();

  const tasksQuery = useDashboardTasks();
  const meetingsQuery = useDashboardMeetings();
  const projectsQuery = useDashboardProjects();
  const teamQuery = useDashboardTeam();

  const activityQuery = useDashboardActivity();
  const { people, nameOf, ready: peopleReady } = usePeople();

  const today = todayDateOnly();
  const now = useNow();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">{user ? `Hola, ${user.firstName}` : 'Dashboard'}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateOnly(today, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardSection title="Mis tareas" icon={ListTodo} href="/schedule?kind=task">
          <QueryState
            query={tasksQuery}
            skeleton={<BlockSkeleton />}
            emptyWhen={(items) => prioritizeTasks(items.filter((item) => item.kind === 'task'), today, 1).length === 0}
            empty={<EmptyState icon={CheckCircle2} title="No tienes tareas pendientes" className="border-none py-6" />}
          >
            {(items) => (
              <ul>
                {prioritizeTasks(
                  items.filter((item) => item.kind === 'task'),
                  today,
                  TASK_LIMIT,
                ).map((task) => {
                  const overdue = isBeforeToday(task.end);
                  return (
                    <li key={task.id}>
                      <Link to={`/projects/${task.projectId}/tasks?taskId=${task.id}`} className={rowClass}>
                        {overdue ? (
                          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                        ) : (
                          <ListTodo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{task.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {projectNames.get(task.projectId)}
                          </span>
                        </span>
                        <span className={overdue ? 'shrink-0 text-xs font-medium text-destructive' : 'shrink-0 text-xs text-muted-foreground'}>
                          {overdue ? 'Atrasada · ' : 'Vence '}
                          {formatDateOnly(task.end, { day: 'numeric', month: 'short' })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </DashboardSection>

        <DashboardSection title="Próximas reuniones" icon={CalendarClock} href="/schedule?kind=meeting">
          <QueryState
            query={meetingsQuery}
            skeleton={<BlockSkeleton />}
            emptyWhen={(items) => nextMeetings(items, now, 1).length === 0}
            empty={<EmptyState icon={CalendarClock} title="Sin reuniones próximas" description="Nada programado en los próximos 30 días." className="border-none py-6" />}
          >
            {(items) => (
              <ul>
                {nextMeetings(items, now, MEETING_LIMIT).map((meeting) => (
                  <li key={meeting.id}>
                    <Link to={`/projects/${meeting.projectId}/meetings?meetingId=${meeting.id}`} className={rowClass}>
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{meeting.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {projectNames.get(meeting.projectId)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {formatDateOnly(instantToLocalDay(meeting.start), { weekday: 'short', day: 'numeric', month: 'short' })}
                        <br />
                        {formatTime(meeting.start)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </DashboardSection>

        <DashboardSection title="Proyectos activos" icon={FolderKanban} href="/projects?view=active">
          <QueryState
            query={projectsQuery}
            skeleton={<BlockSkeleton />}
            emptyWhen={(data) => data.data.length === 0}
            empty={<EmptyState icon={FolderKanban} title="Sin proyectos activos" className="border-none py-6" />}
          >
            {(data) => (
              <ul>
                {data.data.slice(0, DASHBOARD_PROJECT_LIMIT).map((project) => {
                  const late = !!project.expectedEndDate && isBeforeToday(project.expectedEndDate);
                  return (
                    <li key={project.id}>
                      <Link to={`/projects/${project.id}/overview`} className={rowClass}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{project.name}</span>
                          <span className={late ? 'block text-xs font-medium text-destructive' : 'block text-xs text-muted-foreground'}>
                            {late && 'Atrasado · '}
                            {project.expectedEndDate
                              ? `Fin esperado ${formatDateOnly(project.expectedEndDate, { day: 'numeric', month: 'short' })}`
                              : 'Sin fecha límite'}
                          </span>
                        </span>
                        <ProjectStatusBadge status={project.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </DashboardSection>

        <DashboardSection title="Actividad reciente" icon={History} href="/projects?view=active" hrefLabel="Ver proyectos">
          <QueryState
            query={{ ...activityQuery, isPending: activityQuery.isPending || !peopleReady }}
            skeleton={<BlockSkeleton rows={4} />}
            emptyWhen={(events) => events.length === 0}
            empty={<EmptyState icon={History} title="Sin actividad reciente" className="border-none py-6" />}
          >
            {(events) => <ActivityFeed events={events} people={people} nameOf={nameOf} projectNames={projectNames} />}
          </QueryState>
        </DashboardSection>
      </div>

      <DashboardSection title="Equipo" icon={Users} href="/team">
        <QueryState
          query={teamQuery}
          skeleton={<BlockSkeleton rows={2} />}
          emptyWhen={(data) => data.data.length === 0}
          empty={<EmptyState icon={Users} title="Aún no hay compañeros activos" className="border-none py-6" />}
        >
          {(data) => (
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
              {data.data.map((member) => (
                <li key={member.id}>
                  <Link to={`/users/${member.id}/profile`} className={rowClass}>
                    <UserAvatar firstName={member.firstName} lastName={member.lastName} className="size-8" />
                    <span className="min-w-0 truncate font-medium">{fullName(member)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </DashboardSection>
    </div>
  );
}
