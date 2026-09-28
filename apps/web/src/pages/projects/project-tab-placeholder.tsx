import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function ProjectTabPlaceholder({ tab }: { tab: string }) {
  useSetBreadcrumb(`Proyecto / ${tab}`);
  return <ComingSoon title={tab} />;
}
