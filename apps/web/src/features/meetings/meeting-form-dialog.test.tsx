// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installDomShims } from '@/test/dom-shims';
import type { Meeting, MeetingDetail, ProjectMember } from '@/types/domain';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x.io', isOwner: false },
    can: () => true,
  }),
}));
vi.mock('./api', () => ({
  createMeeting: vi.fn(),
  updateMeeting: vi.fn(),
  setMeetingParticipants: vi.fn(),
}));

import * as api from './api';
import { MeetingFormDialog } from './meeting-form-dialog';

// vitest.config.ts pins TZ=America/Guayaquil (UTC-5).
const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'Test', email: `${id}@x.io`, avatarStorageKey: null });
const member = (userId: string, firstName: string): ProjectMember => ({
  userId,
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  user: person(userId, firstName),
});
const members = [member('u1', 'Ana'), member('u2', 'Luis'), member('u3', 'Marta')];
const created = {} as Meeting;

function existing(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    id: 'm1',
    projectId: 'p1',
    title: 'Planificación',
    description: 'Agenda original',
    startsAt: '2026-09-29T15:00:00.000Z', // 10:00 local
    endsAt: '2026-09-29T16:00:00.000Z', // 11:00 local
    organizerId: 'u1',
    notes: null,
    revision: 1,
    notesUpdatedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    participants: [
      { userId: 'u1', addedAt: '2026-09-01T00:00:00Z', user: person('u1', 'Ana') },
      { userId: 'u2', addedAt: '2026-09-01T00:00:00Z', user: person('u2', 'Luis') },
    ],
    viewerCapabilities: { role: 'MANAGER', isOrganizer: true, isParticipant: true, canEditStructure: true, canEditNotes: true, canDelete: true },
    ...overrides,
  };
}

function renderDialog(meeting?: MeetingDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const onOpenChange = vi.fn();
  render(<MeetingFormDialog open onOpenChange={onOpenChange} projectId="p1" members={members} meeting={meeting} />, { wrapper });
  return { onOpenChange };
}

describe('MeetingFormDialog', () => {
  beforeAll(() => installDomShims());
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('creates a meeting sending UTC instants for the local times and the chosen invitees', async () => {
    vi.mocked(api.createMeeting).mockResolvedValue(created);
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Revisión semanal' } });
    fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: '2026-09-30T09:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-09-30T10:30' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Luis/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear reunión' }));

    await waitFor(() => expect(api.createMeeting).toHaveBeenCalled());
    expect(api.createMeeting).toHaveBeenCalledWith('p1', {
      title: 'Revisión semanal',
      description: undefined,
      startsAt: '2026-09-30T14:00:00.000Z', // 09:00 at UTC-5
      endsAt: '2026-09-30T15:30:00.000Z',
      participantIds: ['u2'], // the organizer is added by the API, never listed here
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('blocks an end that is not after the start, with the error next to the field', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: '2026-09-30T10:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-09-30T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear reunión' }));

    expect(await screen.findByText('El fin debe ser posterior al inicio.')).toBeTruthy();
    expect(api.createMeeting).not.toHaveBeenCalled();
  });

  it('shows the organizer as a fixed participant', () => {
    renderDialog();
    const checkbox = screen.getByText(/Ana Ruiz · organizador/).closest('label')?.querySelector('[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    expect(checkbox?.hasAttribute('disabled')).toBe(true); // can't be unticked: the API always keeps the organizer
  });

  it('edits only what changed: an untouched schedule is never re-sent (no spurious notifications)', async () => {
    vi.mocked(api.updateMeeting).mockResolvedValue(created);
    renderDialog(existing());

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Planificación Q4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.updateMeeting).toHaveBeenCalled());
    expect(api.updateMeeting).toHaveBeenCalledWith('p1', 'm1', { title: 'Planificación Q4' });
    expect(api.setMeetingParticipants).not.toHaveBeenCalled();
  });

  it('updates participants through their own endpoint when they change', async () => {
    vi.mocked(api.setMeetingParticipants).mockResolvedValue(created);
    renderDialog(existing());

    fireEvent.click(screen.getByRole('checkbox', { name: /Marta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.setMeetingParticipants).toHaveBeenCalledWith('p1', 'm1', ['u2', 'u3']));
    expect(api.updateMeeting).not.toHaveBeenCalled();
  });

  it('flags a participant who is no longer a project member so the API rule can be satisfied', () => {
    renderDialog(
      existing({
        participants: [
          { userId: 'u1', addedAt: '2026-09-01T00:00:00Z', user: person('u1', 'Ana') },
          { userId: 'gone', addedAt: '2026-09-01T00:00:00Z', user: person('gone', 'Pedro') },
        ],
      }),
    );
    expect(screen.getByText(/Ya no es miembro del proyecto/)).toBeTruthy();
  });
});
