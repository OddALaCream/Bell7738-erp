import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function UserProfilePage() {
  useSetBreadcrumb('Perfil de usuario');
  return <ComingSoon title="Perfil de usuario" />;
}
