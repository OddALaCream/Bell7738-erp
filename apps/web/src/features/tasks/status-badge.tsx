import { CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TaskStatus } from '@/types/domain';

const STATUS_CONFIG: Record<TaskStatus, { label: string; variant: 'success' | 'secondary' | 'outline'; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pendiente', variant: 'outline', icon: Circle },
  IN_PROGRESS: { label: 'En progreso', variant: 'secondary', icon: PlayCircle },
  DONE: { label: 'Terminada', variant: 'success', icon: CheckCircle2 },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon /> {config.label}
    </Badge>
  );
}
