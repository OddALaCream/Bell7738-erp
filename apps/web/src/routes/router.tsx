import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth, RequireGuest } from './protected-route';
import { LoginPage } from '@/pages/login-page';
import { AcceptInvitationPage } from '@/pages/accept-invitation-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { SchedulePage } from '@/pages/schedule-page';
import { TeamPage } from '@/pages/team-page';
import { ProfilePage } from '@/pages/profile-page';
import { ProfileSessionsPage } from '@/pages/profile-sessions-page';
import { UserProfilePage } from '@/pages/user-profile-page';
import { NotificationsPage } from '@/pages/notifications-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { AdminUsersPage } from '@/pages/admin/admin-users-page';
import { AdminRolesPage } from '@/pages/admin/admin-roles-page';
import { AdminAuditPage } from '@/pages/admin/admin-audit-page';
import { ProjectsListPage } from '@/pages/projects/projects-list-page';
import { ProjectTabPlaceholder } from '@/pages/projects/project-tab-placeholder';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  { path: '/invitations/accept', element: <AcceptInvitationPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'projects', element: <ProjectsListPage /> },
      { path: 'projects/:projectId/overview', element: <ProjectTabPlaceholder tab="Overview" /> },
      { path: 'projects/:projectId/tasks', element: <ProjectTabPlaceholder tab="Tareas" /> },
      { path: 'projects/:projectId/timeline', element: <ProjectTabPlaceholder tab="Cronograma" /> },
      { path: 'projects/:projectId/calendar', element: <ProjectTabPlaceholder tab="Calendario" /> },
      { path: 'projects/:projectId/meetings', element: <ProjectTabPlaceholder tab="Reuniones" /> },
      { path: 'projects/:projectId/documents', element: <ProjectTabPlaceholder tab="Documentos" /> },
      { path: 'projects/:projectId/members', element: <ProjectTabPlaceholder tab="Miembros" /> },
      { path: 'projects/:projectId/activity', element: <ProjectTabPlaceholder tab="Actividad" /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'profile/sessions', element: <ProfileSessionsPage /> },
      { path: 'users/:userId/profile', element: <UserProfilePage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'admin/users', element: <AdminUsersPage /> },
      { path: 'admin/roles', element: <AdminRolesPage /> },
      { path: 'admin/audit', element: <AdminAuditPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
