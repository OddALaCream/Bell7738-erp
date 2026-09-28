import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function DashboardPage() {
  useSetBreadcrumb('Dashboard');
  return <ComingSoon title="Dashboard" />;
}
