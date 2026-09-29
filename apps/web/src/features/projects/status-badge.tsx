import { CalendarClock, CheckCircle2, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProjectStatus } from '@/types/domain';
import { PROJECT_STATUS_LABEL } from './labels';

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }
> = {
  PLANNED: { label: PROJECT_STATUS_LABEL.PLANNED, variant: 'secondary', icon: CalendarClock },
  ACTIVE: { label: PROJECT_STATUS_LABEL.ACTIVE, variant: 'success', icon: PlayCircle },
  PAUSED: { label: PROJECT_STATUS_LABEL.PAUSED, variant: 'warning', icon: PauseCircle },
  COMPLETED: { label: PROJECT_STATUS_LABEL.COMPLETED, variant: 'secondary', icon: CheckCircle2 },
  CANCELLED: { label: PROJECT_STATUS_LABEL.CANCELLED, variant: 'destructive', icon: XCircle },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon /> {config.label}
    </Badge>
  );
}
