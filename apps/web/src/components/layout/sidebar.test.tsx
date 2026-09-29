// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeCan } from '@/lib/permissions';

let permissions: string[] = [];
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', isOwner: false }, can: makeCan(permissions) }),
}));
vi.mock('./sidebar-context', () => ({ useSidebar: () => ({ collapsed: false, toggle: vi.fn() }) }));

import { Sidebar } from './sidebar';

function renderSidebar(held: string[]) {
  permissions = held;
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar administration section', () => {
  afterEach(cleanup);

  it('is shown to a non-Owner administrator, limited to what they can use', () => {
    renderSidebar(['USERS_VIEW', 'AUDIT_VIEW']);
    expect(screen.getByText('Administración')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Auditoría' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Roles' })).toBeNull();
  });

  it('is hidden entirely for someone with no administrative permission', () => {
    renderSidebar(['TASKS_CREATE', 'PROJECTS_VIEW_ASSIGNED']);
    expect(screen.queryByText('Administración')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Proyectos' })).toBeTruthy();
  });
});
