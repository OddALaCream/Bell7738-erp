import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** One dashboard block: a bounded sample with a "Ver todo" link (docs/UI-UX.md "Dashboard"). */
export function DashboardSection({
  title,
  icon: Icon,
  href,
  hrefLabel = 'Ver todo',
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  hrefLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = `dashboard-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <Card className={className} role="region" aria-labelledby={headingId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold leading-none">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> {title}
        </h2>
        <Link
          to={href}
          className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground"
          aria-label={`${hrefLabel}: ${title}`}
        >
          {hrefLabel} <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className={cn('space-y-0')}>{children}</CardContent>
    </Card>
  );
}
