import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function NotificationsPage() {
  useSetBreadcrumb('Notificaciones');
  return <ComingSoon title="Historial de notificaciones" />;
}
