import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function AdminRolesPage() {
  useSetBreadcrumb('Administración / Roles');
  return <ComingSoon title="Roles" />;
}
