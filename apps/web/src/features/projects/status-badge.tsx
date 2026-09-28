import { CalendarClock, CheckCircle2, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProjectStatus } from '@/types/domain';

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }
> = {
  PLANNED: { label: 'Planificado', variant: 'secondary', icon: CalendarClock },
  ACTIVE: { label: 'Activo', variant: 'success', icon: PlayCircle },
  PAUSED: { label: 'Pausado', variant: 'warning', icon: PauseCircle },
  COMPLETED: { label: 'Completado', variant: 'secondary', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', variant: 'destructive', icon: XCircle },
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
