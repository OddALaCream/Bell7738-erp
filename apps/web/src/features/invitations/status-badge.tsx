import { CheckCircle2, Clock, Ban, TimerOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { InvitationStatus } from '@/types/domain';

const STATUS_CONFIG: Record<InvitationStatus, { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }> = {
  pending: { label: 'Pendiente', variant: 'secondary', icon: Clock },
  accepted: { label: 'Aceptada', variant: 'success', icon: CheckCircle2 },
  expired: { label: 'Expirada', variant: 'warning', icon: TimerOff },
  revoked: { label: 'Revocada', variant: 'destructive', icon: Ban },
};

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon /> {config.label}
    </Badge>
  );
}
