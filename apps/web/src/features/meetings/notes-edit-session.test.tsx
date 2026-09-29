// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installDomShims } from '@/test/dom-shims';
import { ApiError } from '@/lib/api-types';
import type { MeetingDetail } from '@/types/domain';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./api', () => ({
  updateMeetingNotes: vi.fn(),
  getMeeting: vi.fn(),
}));

import * as api from './api';
import { NotesEditSession } from './notes-edit-session';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

function meeting(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    id: 'm1',
    projectId: 'p1',
    title: 'Planificación',
    description: null,
    startsAt: '2026-09-28T15:00:00Z',
    endsAt: '2026-09-28T16:00:00Z',
    organizerId: 'u1',
    notes: emptyDoc,
    revision: 3,
    notesUpdatedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    participants: [],
    viewerCapabilities: {
      role: 'MANAGER',
      isOrganizer: true,
      isParticipant: true,
      canEditStructure: true,
      canEditNotes: true,
      canDelete: true,
    },
    ...overrides,
  };
}

function renderSession(current: MeetingDetail = meeting()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const onExit = vi.fn();
  const onDirtyChange = vi.fn();
  render(<NotesEditSession projectId="p1" meeting={current} onExit={onExit} onDirtyChange={onDirtyChange} />, { wrapper });
  return { onExit, onDirtyChange };
}

/** Toggling a checklist changes the document, which is what makes the draft "dirty" (no typing needed in jsdom). */
function makeDraftDirty() {
  fireEvent.click(screen.getByRole('button', { name: 'Lista de tareas' }));
}

const conflict = new ApiError(409, {
  code: 'REVISION_CONFLICT',
  message: 'The meeting notes were changed by someone else. Reload and retry.',
  currentRevision: 5,
  updatedAt: '2026-09-28T16:30:00.000Z',
});

describe('NotesEditSession', () => {
  beforeAll(() => installDomShims());
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('saves against the revision the draft is based on, then reports "Guardado"', async () => {
    vi.mocked(api.updateMeetingNotes).mockResolvedValue(meeting({ revision: 4 }));
    renderSession();

    const save = screen.getByRole('button', { name: 'Guardar notas' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing to save yet

    makeDraftDirty();
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(screen.getByText('Cambios sin guardar')).toBeTruthy();

    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Guardado')).toBeTruthy());
    expect(api.updateMeetingNotes).toHaveBeenCalledWith('p1', 'm1', expect.objectContaining({ type: 'doc' }), 3);
  });

  it('on REVISION_CONFLICT keeps the draft, blocks saving and offers no overwrite', async () => {
    vi.mocked(api.updateMeetingNotes).mockRejectedValue(conflict);
    renderSession();
    makeDraftDirty();
    const save = screen.getByRole('button', { name: 'Guardar notas' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));

    fireEvent.click(save);

    const alert = await screen.findByText(/Otra persona guardó cambios en las notas/);
    expect(alert).toBeTruthy();
    expect(screen.getByText(/revisión 5/)).toBeTruthy();
    // The draft is still there, saving is blocked, and the only ways forward are copy and reload.
    expect(document.querySelector('ul[data-type="taskList"]')).not.toBeNull();
    expect(save.disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Copiar mi borrador/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recargar la última versión/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sobrescribir|forzar|guardar de todos modos/i })).toBeNull();
    // A second click must not retry with the stale revision.
    fireEvent.click(save);
    expect(api.updateMeetingNotes).toHaveBeenCalledTimes(1);
  });

  it('reloading the latest version sets the draft aside read-only instead of discarding it', async () => {
    vi.mocked(api.updateMeetingNotes).mockRejectedValue(conflict);
    vi.mocked(api.getMeeting).mockResolvedValue(
      meeting({
        revision: 5,
        notes: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Versión de otra persona' }] }] },
      }),
    );
    renderSession();
    makeDraftDirty();
    const save = screen.getByRole('button', { name: 'Guardar notas' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await screen.findByText(/Otra persona guardó cambios/);

    fireEvent.click(screen.getByRole('button', { name: /Recargar la última versión/ }));

    // The editor now shows the other person's text (once) and the conflict is resolved…
    await screen.findByText('Versión de otra persona');
    expect(screen.getAllByText('Versión de otra persona')).toHaveLength(1);
    expect(screen.queryByText(/Otra persona guardó cambios/)).toBeNull();

    // …while the user's OWN previous draft (the checklist they added) is kept, read-only,
    // and does not contain the other person's text. Regression: it once held the new version.
    const stash = screen.getByText(/Tu borrador anterior/).closest('details');
    expect(stash).not.toBeNull();
    expect(stash?.querySelector('ul[data-type="taskList"]')).not.toBeNull();
    expect(stash?.textContent).not.toContain('Versión de otra persona');
    expect(screen.getByRole('button', { name: /Copiar borrador/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Descartar este borrador/ })).toBeTruthy();

    // Saving is possible again, now against the reloaded revision (5), and starts clean.
    expect((screen.getByRole('button', { name: 'Guardar notas' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sin cambios')).toBeTruthy();
  });

  it('warns before leaving with unsaved changes', async () => {
    const { onExit, onDirtyChange } = renderSession();
    makeDraftDirty();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('¿Salir sin guardar?')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('shows a permission error without dropping the draft when the API answers 403', async () => {
    vi.mocked(api.updateMeetingNotes).mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'Forbidden' }));
    renderSession();
    makeDraftDirty();
    const save = screen.getByRole('button', { name: 'Guardar notas' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));

    fireEvent.click(save);

    expect(await screen.findByText(/Ya no tienes permiso para editar estas notas/)).toBeTruthy();
    expect(document.querySelector('ul[data-type="taskList"]')).not.toBeNull();
  });
});
