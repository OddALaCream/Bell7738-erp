import { useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { QueryErrorState } from '@/components/common/query-state';
import { useProjectMembers } from '@/features/projects/hooks';
import { useProjectCalendar, type DateRange } from '@/features/schedule/hooks';
import { CalendarView, type SelectedCalendarItem, type VisibleRange } from '@/features/schedule/calendar-view';
import { TaskDetailSheet } from '@/features/tasks/task-detail-sheet';
import type { ProjectDetail } from '@/types/domain';

export function ProjectCalendarPage() {
  const project = useOutletContext<ProjectDetail>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const membersQuery = useProjectMembers(project.id);

  // Reported by the calendar on mount and on every month/week/list navigation.
  const [range, setRange] = useState<DateRange | null>(null);
  const calendarQuery = useProjectCalendar(project.id, range);

  function handleRangeChange({ from, to }: VisibleRange) {
    setRange((current) => (current && current.from === from && current.to === to ? current : { from, to }));
  }

  function handleSelect(item: SelectedCalendarItem) {
    if (item.kind === 'task') {
      const params = new URLSearchParams(searchParams);
      params.set('taskId', item.id);
      setSearchParams(params, { replace: true });
    } else {
      // The meeting detail lives with the Reuniones tab.
      navigate(`/projects/${item.projectId}/meetings?meetingId=${item.id}`);
    }
  }

  return (
    <div className="space-y-4">
      {calendarQuery.isError && <QueryErrorState error={calendarQuery.error} onRetry={() => calendarQuery.refetch()} />}

      <CalendarView
        items={calendarQuery.data ?? []}
        loading={calendarQuery.isFetching}
        onSelectItem={handleSelect}
        onRangeChange={handleRangeChange}
      />

      <TaskDetailSheet projectId={project.id} members={membersQuery.data ?? []} projectRole={project.viewerCapabilities.role} />
    </div>
  );
}
