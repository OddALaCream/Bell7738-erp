import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth, RequireDashboard, RequireGuest, RequirePermission } from './protected-route';
import { LoginPage } from '@/pages/login-page';
import { AcceptInvitationPage } from '@/pages/accept-invitation-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { TeamPage } from '@/pages/team-page';
import { ProfilePage } from '@/pages/profile-page';
import { ProfileSessionsPage } from '@/pages/profile-sessions-page';
import { UserProfilePage } from '@/pages/user-profile-page';
import { NotificationsPage } from '@/pages/notifications-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import { ProjectsListPage } from '@/pages/projects/projects-list-page';
import { ProjectLayout } from '@/pages/projects/project-layout';
import { ProjectOverviewPage } from '@/pages/projects/project-overview-page';
import { ProjectMembersPage } from '@/pages/projects/project-members-page';
import { ProjectTasksPage } from '@/pages/projects/project-tasks-page';

/**
 * Screens that pull in the heavy libraries (FullCalendar, Tiptap) or are
 * rarely opened load on demand, keeping the first download — the one every
 * phone pays on launch — small. Named exports are adapted for `lazy`.
 */
function lazyPage<Module>(load: () => Promise<Module>, name: keyof Module) {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  // The API's link is `/accept-invitation#token=…`; the older path stays as an alias.
  { path: '/accept-invitation', element: <AcceptInvitationPage /> },
  { path: '/invitations/accept', element: <AcceptInvitationPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Pathless: a failing screen shows the error inside the shell instead of replacing it.
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            element: (
              <RequireDashboard>
                <DashboardPage />
              </RequireDashboard>
            ),
          },
          { path: 'schedule', lazy: lazyPage(() => import('@/pages/schedule-page'), 'SchedulePage') },
          { path: 'projects', element: <ProjectsListPage /> },
          {
            path: 'projects/:projectId',
            element: <ProjectLayout />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <ProjectOverviewPage /> },
              { path: 'tasks', element: <ProjectTasksPage /> },
              { path: 'timeline', lazy: lazyPage(() => import('@/pages/projects/project-timeline-page'), 'ProjectTimelinePage') },
              { path: 'calendar', lazy: lazyPage(() => import('@/pages/projects/project-calendar-page'), 'ProjectCalendarPage') },
              { path: 'meetings', lazy: lazyPage(() => import('@/pages/projects/project-meetings-page'), 'ProjectMeetingsPage') },
              { path: 'documents', lazy: lazyPage(() => import('@/pages/projects/project-documents-page'), 'ProjectDocumentsPage') },
              { path: 'members', element: <ProjectMembersPage /> },
              { path: 'activity', lazy: lazyPage(() => import('@/pages/projects/project-activity-page'), 'ProjectActivityPage') },
            ],
          },
          { path: 'team', element: <TeamPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'profile/sessions', element: <ProfileSessionsPage /> },
          { path: 'users/:userId/profile', element: <UserProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          {
            element: (
              <RequirePermission anyOf={['USERS_VIEW', 'USERS_CREATE']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ path: 'admin/users', lazy: lazyPage(() => import('@/pages/admin/admin-users-page'), 'AdminUsersPage') }],
          },
          {
            element: (
              <RequirePermission anyOf={['ROLES_VIEW', 'ROLES_MANAGE']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ path: 'admin/roles', lazy: lazyPage(() => import('@/pages/admin/admin-roles-page'), 'AdminRolesPage') }],
          },
          {
            element: (
              <RequirePermission anyOf={['AUDIT_VIEW']}>
                <Outlet />
              </RequirePermission>
            ),
            children: [{ path: 'admin/audit', lazy: lazyPage(() => import('@/pages/admin/admin-audit-page'), 'AdminAuditPage') }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
