import { CheckCircle2, Clock, Ban, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { UserStatus } from '@/types/domain';

const STATUS_CONFIG: Record<UserStatus, { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }> = {
  INVITED: { label: 'Invitado', variant: 'secondary', icon: Clock },
  ACTIVE: { label: 'Activo', variant: 'success', icon: CheckCircle2 },
  SUSPENDED: { label: 'Suspendido', variant: 'warning', icon: Ban },
  DISABLED: { label: 'Deshabilitado', variant: 'destructive', icon: XCircle },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon /> {config.label}
    </Badge>
  );
}
