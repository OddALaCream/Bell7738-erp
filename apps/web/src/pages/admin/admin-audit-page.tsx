import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function AdminAuditPage() {
  useSetBreadcrumb('Administración / Auditoría');
  return <ComingSoon title="Auditoría" />;
}
