import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function ProfilePage() {
  useSetBreadcrumb('Perfil');
  return <ComingSoon title="Perfil" />;
}
