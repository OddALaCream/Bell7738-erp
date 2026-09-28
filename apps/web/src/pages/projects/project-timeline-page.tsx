import { useOutletContext, useSearchParams } from 'react-router-dom';
import { GanttChartSquare, LayoutList, ListTodo } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useProjectMembers } from '@/features/projects/hooks';
import { useProjectTimeline } from '@/features/schedule/hooks';
import { TimelineView } from '@/features/schedule/timeline-view';
import { TimelineList } from '@/features/schedule/timeline-list';
import { TaskDetailSheet } from '@/features/tasks/task-detail-sheet';
import type { ProjectDetail } from '@/types/domain';

type TimelineMode = 'bars' | 'list';

export function ProjectTimelinePage() {
  const project = useOutletContext<ProjectDetail>();
  const [searchParams, setSearchParams] = useSearchParams();
  const compact = useMediaQuery('(max-width: 639px)');
  const membersQuery = useProjectMembers(project.id);
  const timelineQuery = useProjectTimeline(project.id);

  // The bar chart needs horizontal room; default to the accessible list on phones.
  const requested = searchParams.get('view');
  const mode: TimelineMode = requested === 'bars' || requested === 'list' ? requested : compact ? 'list' : 'bars';

  function setMode(next: TimelineMode) {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  }

  function openTask(taskId: string) {
    const params = new URLSearchParams(searchParams);
    params.set('taskId', taskId);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1" role="group" aria-label="Tipo de vista">
        <Button variant={mode === 'bars' ? 'secondary' : 'ghost'} size="sm" aria-pressed={mode === 'bars'} onClick={() => setMode('bars')}>
          <GanttChartSquare /> Barras
        </Button>
        <Button variant={mode === 'list' ? 'secondary' : 'ghost'} size="sm" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
          <LayoutList /> Lista
        </Button>
      </div>

      <QueryState
        query={timelineQuery}
        skeleton={<Skeleton className="h-64 w-full" />}
        emptyWhen={(tasks) => tasks.length === 0}
        empty={
          <EmptyState
            icon={ListTodo}
            title="Aún no hay tareas en el cronograma"
            description="Las tareas del proyecto aparecerán aquí con su rango de fechas."
          />
        }
      >
        {(tasks) =>
          mode === 'bars' ? (
            <TimelineView tasks={tasks} onSelectTask={openTask} />
          ) : (
            <TimelineList tasks={tasks} onSelectTask={openTask} />
          )
        }
      </QueryState>

      <TaskDetailSheet projectId={project.id} members={membersQuery.data ?? []} projectRole={project.viewerCapabilities.role} />
    </div>
  );
}
