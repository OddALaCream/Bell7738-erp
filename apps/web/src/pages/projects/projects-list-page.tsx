import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { ComingSoon } from '@/components/common/coming-soon';

export function ProjectsListPage() {
  useSetBreadcrumb('Proyectos');
  return <ComingSoon title="Proyectos" />;
}
