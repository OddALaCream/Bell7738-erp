import { toDateOnly } from '@/lib/dates';
import type { CalendarItem, ProjectSummary } from '@/types/domain';
import type { ProfileContent, ProfileProject, ProfileTask } from './profile-view';

const ENDED_STATUSES = new Set<ProjectSummary['status']>(['COMPLETED', 'CANCELLED']);
const COMPLETED_TASKS_SHOWN = 10;

/** Does the server's profile payload carry anything at all (it currently always sends empty lists)? */
export function isProfilePopulated(profile: {
  roles: unknown[];
  activeProjects: unknown[];
  pastProjects: unknown[];
  activeTasks: unknown[];
  completedTasks: unknown[];
}): boolean {
  return (
    profile.roles.length +
      profile.activeProjects.length +
      profile.pastProjects.length +
      profile.activeTasks.length +
      profile.completedTasks.length >
    0
  );
}

/**
 * The own profile is built from endpoints that do return data (the server's
 * `/me/profile` lists are empty): assigned tasks come from `/me/schedule`,
 * projects from what the user can see in `/projects`.
 */
export function buildOwnProfileContent(
  scheduleItems: CalendarItem[],
  projects: ProjectSummary[],
  roles: string[],
): ProfileContent {
  const tasks: ProfileTask[] = scheduleItems
    .filter((item): item is Extract<CalendarItem, { kind: 'task' }> => item.kind === 'task')
    .map((item) => ({
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      dueDate: toDateOnly(item.end),
      status: item.status,
    }));

  const byDueAsc = (a: ProfileTask, b: ProfileTask) => a.dueDate.localeCompare(b.dueDate);
  const toProject = (project: ProjectSummary): ProfileProject => ({ id: project.id, name: project.name, status: project.status });

  return {
    roles,
    activeTasks: tasks.filter((task) => task.status !== 'DONE').sort(byDueAsc),
    completedTasks: tasks
      .filter((task) => task.status === 'DONE')
      .sort((a, b) => byDueAsc(b, a))
      .slice(0, COMPLETED_TASKS_SHOWN),
    activeProjects: projects.filter((project) => !ENDED_STATUSES.has(project.status)).map(toProject),
    pastProjects: projects.filter((project) => ENDED_STATUSES.has(project.status)).map(toProject),
  };
}
