import { ComingSoon } from '@/components/common/coming-soon';

/** The parent ProjectLayout already sets the breadcrumb for all project tabs. */
export function ProjectTabPlaceholder({ tab }: { tab: string }) {
  return <ComingSoon title={tab} />;
}
