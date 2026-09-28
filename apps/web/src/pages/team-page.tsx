import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function TeamPage() {
  useSetBreadcrumb('Equipo');
  return <ComingSoon title="Equipo" />;
}
