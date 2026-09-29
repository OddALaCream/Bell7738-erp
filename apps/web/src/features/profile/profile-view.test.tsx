// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileView } from './profile-view';
import type { ProfileExtras } from './api';

const person = { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x.io' };

const content: ProfileExtras = {
  roles: [
    { id: 'r1', name: 'Developer', color: '#336699', position: 1 },
    { id: 'r2', name: 'Diseño', color: '#993366', position: 2 },
  ],
  activeProjects: [
    { id: 'p1', name: 'Alpha', status: 'ACTIVE', role: 'MANAGER', startDate: '2026-01-05', expectedEndDate: null },
  ],
  pastProjects: [
    { id: 'p2', name: 'Beta', status: 'COMPLETED', role: 'MEMBER', startDate: null, expectedEndDate: null },
  ],
  activeTasks: [
    {
      id: 't1',
      projectId: 'p1',
      projectName: 'Alpha',
      title: 'Construir login',
      startDate: '2026-09-01',
      dueDate: '2026-09-30',
      status: 'IN_PROGRESS',
      completedAt: null,
    },
  ],
  completedTasks: [
    {
      id: 't2',
      projectId: 'p2',
      projectName: 'Beta',
      title: 'Diseñar logo',
      startDate: '2026-08-01',
      dueDate: '2026-08-10',
      status: 'DONE',
      completedAt: '2026-08-09T12:00:00Z',
    },
  ],
};

function renderView(overrides: Partial<ProfileExtras> = {}, isOwner = false) {
  render(
    <MemoryRouter>
      <ProfileView profile={person} content={{ ...content, ...overrides }} isOwner={isOwner} />
    </MemoryRouter>,
  );
}

describe('ProfileView', () => {
  afterEach(cleanup);

  it('shows the roles, projects and tasks exactly as the server reports them', () => {
    renderView();
    expect(screen.getByText('Developer')).toBeTruthy();
    expect(screen.getByText('Diseño')).toBeTruthy();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/projects/p1/overview');
    expect(hrefs).toContain('/projects/p2/overview');
    expect(hrefs).toContain('/projects/p1/tasks?taskId=t1');
    expect(screen.getByText('Construir login')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
    // A finished task keeps a text alternative, not only reduced opacity.
    expect(screen.getByText('Terminada:')).toBeTruthy();
  });

  it('states plainly that there is nothing to show — never that the server "does not report it"', () => {
    renderView({ roles: [], activeProjects: [], pastProjects: [], activeTasks: [], completedTasks: [] });
    expect(screen.getByText('Sin proyectos activos')).toBeTruthy();
    expect(screen.getByText('Sin tareas terminadas')).toBeTruthy();
    expect(screen.queryByText(/servidor/i)).toBeNull();
    expect(screen.queryByLabelText('Roles')).toBeNull();
  });

  it('marks the Owner only when told (own profile)', () => {
    renderView({ roles: [] }, true);
    expect(screen.getByText('Owner')).toBeTruthy();
  });
});
