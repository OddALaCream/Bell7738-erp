import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function AdminUsersPage() {
  useSetBreadcrumb('Administración / Usuarios');
  return <ComingSoon title="Usuarios" />;
}
