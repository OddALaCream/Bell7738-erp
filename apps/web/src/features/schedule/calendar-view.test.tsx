// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { installDomShims } from '@/test/dom-shims';
import type { CalendarItem } from '@/types/domain';
import { CalendarView } from './calendar-view';

// vitest.config.ts pins TZ=America/Guayaquil (UTC-5).
const items: CalendarItem[] = [
  { kind: 'task', id: 't1', projectId: 'p1', title: 'Diseñar login', start: '2026-09-10', end: '2026-09-12', status: 'DONE' },
  { kind: 'task', id: 't2', projectId: 'p1', title: 'Implementar API', start: '2026-09-14', end: '2026-09-16', status: 'IN_PROGRESS' },
  { kind: 'meeting', id: 'm1', projectId: 'p1', title: 'Planificación', start: '2026-09-15T15:00:00Z', end: '2026-09-15T16:00:00Z' },
];

describe('CalendarView', () => {
  beforeAll(() => installDomShims());
  afterEach(cleanup);

  it('shows tasks and meetings as distinct kinds, with the finished task marked', () => {
    const { container } = render(
      <CalendarView items={items} initialDate="2026-09-15" onSelectItem={vi.fn()} onRangeChange={vi.fn()} />,
    );

    expect(screen.getByText('Diseñar login')).toBeTruthy();
    expect(screen.getByText('Implementar API')).toBeTruthy();
    expect(screen.getByText('Planificación')).toBeTruthy();

    expect(container.querySelectorAll('.fc-event-task').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.fc-event-meeting').length).toBeGreaterThan(0);
    // DONE: dimmed class AND a text alternative, so state is never color alone.
    expect(container.querySelectorAll('.fc-event-task-done').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tarea terminada:', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reunión:', { exact: false }).length).toBeGreaterThan(0);
  });

  it('reports the visible range as inclusive local dates and the month anchor', () => {
    const onRangeChange = vi.fn();
    render(<CalendarView items={[]} initialDate="2026-09-15" onSelectItem={vi.fn()} onRangeChange={onRangeChange} />);

    // September 2026, Monday-first, FullCalendar's fixed six-week grid: Aug 31 .. Oct 11 inclusive
    // (its own `end` is exclusive: Oct 12). 42 days, well under the API's 100-day cap.
    expect(onRangeChange).toHaveBeenCalledWith({ from: '2026-08-31', to: '2026-10-11', anchor: '2026-09-01' });
  });

  it('renders in Spanish', () => {
    render(<CalendarView items={[]} initialDate="2026-09-15" onSelectItem={vi.fn()} onRangeChange={vi.fn()} />);
    expect(screen.getByText(/septiembre/i)).toBeTruthy();
    expect(screen.getByText('Hoy')).toBeTruthy();
  });
});
