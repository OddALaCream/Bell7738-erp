import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserAvatar } from '@/components/ui/avatar';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { ActivityEvent } from '@/types/domain';
import { activityHref, describeActivity, type NameOf } from './describe';
import type { Person } from './hooks';

/**
 * A readable timeline (docs/PRODUCT.md "Actividad"): who, what, when — and,
 * where the subject still exists, a link to it. Shared by the project tab
 * and the dashboard; `projectName` is only passed when several projects mix.
 */
export function ActivityFeed({
  events,
  people,
  nameOf,
  projectNames,
  className,
}: {
  events: ActivityEvent[];
  people: Map<string, Person>;
  nameOf: NameOf;
  projectNames?: Map<string, string>;
  className?: string;
}) {
  return (
    <ul className={cn('divide-y divide-border', className)}>
      {events.map((event) => {
        const actor = event.actorId ? people.get(event.actorId) : undefined;
        const href = activityHref(event);
        const projectName = projectNames?.get(event.projectId);
        const content = (
          <>
            <UserAvatar firstName={actor?.firstName ?? '?'} lastName={actor?.lastName ?? ''} className="size-7" />
            <span className="min-w-0 flex-1 space-y-0.5 text-sm">
              <span className="block">
                <strong className="font-medium">{nameOf(event.actorId)}</strong> {describeActivity(event, nameOf)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {projectName && <>{projectName} · </>}
                <time dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: es })}
                </time>
              </span>
            </span>
          </>
        );
        return (
          <li key={event.id}>
            {href ? (
              <Link to={href} className="flex items-start gap-3 px-1 py-2.5 hover:bg-accent">
                {content}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-1 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
