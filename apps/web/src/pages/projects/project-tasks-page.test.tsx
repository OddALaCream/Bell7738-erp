// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { installDomShims } from '@/test/dom-shims';
import type { ProjectDetail, Task } from '@/types/domain';

const useTasks = vi.fn();
vi.mock('@/features/tasks/hooks', () => ({
  useTasks: (...args: unknown[]) => useTasks(...args),
  useCompleteTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/projects/hooks', () => ({ useProjectMembers: () => ({ data: [] }) }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', firstName: 'Ana', lastName: 'Ruiz', isOwner: false },
    can: (...keys: string[]) => keys.every((key) => ['TASKS_CREATE', 'TASKS_COMPLETE'].includes(key)),
  }),
}));
vi.mock('@/features/tasks/task-form-dialog', () => ({ TaskFormDialog: () => null }));
vi.mock('@/features/tasks/task-detail-sheet', () => ({ TaskDetailSheet: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ProjectTasksPage } from './project-tasks-page';

const project = {
  id: 'p1',
  viewerCapabilities: { role: 'MEMBER', canUpdate: false, canDelete: false, canManageMembers: false },
} as ProjectDetail;

const task = (id: string, status: Task['status']): Task => ({
  id,
  projectId: 'p1',
  title: `Tarea ${id}`,
  description: null,
  startDate: '2026-09-01T00:00:00.000Z',
  dueDate: '2026-09-30T00:00:00.000Z',
  status,
  createdById: 'u1',
  assignees: [],
  completedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
});

function renderPage(initialEntry = '/tasks') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<Outlet context={project} />}>
          <Route path="/tasks" element={<ProjectTasksPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectTasksPage', () => {
  beforeAll(() => installDomShims());
  beforeEach(() => {
    vi.clearAllMocks();
    useTasks.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      isPlaceholderData: false,
      refetch: vi.fn(),
      data: {
        data: [task('abierta', 'IN_PROGRESS'), task('terminada', 'DONE')],
        meta: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
      },
    });
  });
  afterEach(cleanup);

  it('asks for finished tasks too when no status filter is set, so they stay visible (dimmed)', () => {
    renderPage();
    expect(useTasks).toHaveBeenCalledWith('p1', expect.objectContaining({ includeCompleted: true, status: undefined }));
    expect(screen.getByText('Tarea terminada')).toBeTruthy();
    expect(screen.getAllByText('Terminada').length).toBeGreaterThan(0); // text alternative, not only opacity
  });

  it('passes the due-date range and page from the URL to the API', () => {
    renderPage('/tasks?from=2026-09-01&to=2026-09-30&page=2');
    expect(useTasks).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', page: 2, includeCompleted: true }),
    );
  });

  describe('overdue marking (due date 2026-09-30, local time UTC-5)', () => {
    afterEach(() => vi.useRealTimers());

    it('does not mark a task overdue on its due date, even late in the evening', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T03:00:00Z')); // 22:00 local on 30 Sep: UTC already rolled over
      renderPage();
      expect(screen.queryByText(/atrasada/)).toBeNull();
    });

    it('marks an unfinished task overdue the day after, and never a finished one', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T15:00:00Z')); // 1 Oct local
      renderPage();
      expect(screen.getAllByText(/atrasada/)).toHaveLength(1); // the open one only, not the DONE one
    });
  });
});
