import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function SchedulePage() {
  useSetBreadcrumb('Mi cronograma');
  return <ComingSoon title="Mi cronograma" />;
}
