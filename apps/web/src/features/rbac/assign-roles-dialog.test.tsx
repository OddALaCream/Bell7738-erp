// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installDomShims } from '@/test/dom-shims';
import type { AdminUser } from '@/types/domain';

vi.mock('./hooks', () => ({
  useRoles: () => ({
    isPending: false,
    data: [
      { id: 'r1', name: 'Developer', color: '#336699', position: 1 },
      { id: 'r2', name: 'Diseño', color: '#993366', position: 2 },
      { id: 'r3', name: 'Soporte', color: '#669933', position: 3 },
    ],
  }),
}));

import { AssignRolesDialog } from './assign-roles-dialog';

const user = {
  id: 'u2',
  firstName: 'Luis',
  lastName: 'Pérez',
  roles: [
    { id: 'r1', name: 'Developer', color: '#336699', position: 1 },
    { id: 'r3', name: 'Soporte', color: '#669933', position: 3 },
  ],
} as AdminUser;

describe('AssignRolesDialog', () => {
  beforeAll(() => installDomShims());
  afterEach(cleanup);

  it('opens with the roles the person really has already checked', () => {
    render(<AssignRolesDialog open onOpenChange={() => {}} user={user} onSubmit={vi.fn()} />);
    const checked = (name: string) => screen.getByRole('checkbox', { name }).getAttribute('data-state');
    expect(checked('Developer')).toBe('checked');
    expect(checked('Soporte')).toBe('checked');
    expect(checked('Diseño')).toBe('unchecked');
  });

  it('saving without touching anything sends the current set, so nothing is removed by accident', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AssignRolesDialog open onOpenChange={() => {}} user={user} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar roles' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect([...onSubmit.mock.calls[0]![0]].sort()).toEqual(['r1', 'r3']);
  });

  it('sends the full set after adding and removing a role', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AssignRolesDialog open onOpenChange={() => {}} user={user} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Developer' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Diseño' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar roles' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect([...onSubmit.mock.calls[0]![0]].sort()).toEqual(['r2', 'r3']);
  });
});
