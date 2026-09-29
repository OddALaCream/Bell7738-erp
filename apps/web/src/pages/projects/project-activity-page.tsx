import { useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { History } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { QueryState } from '@/components/common/query-state';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, fullName } from '@/lib/utils';
import { ActivityFeed } from '@/features/activity/activity-feed';
import { ACTIVITY_TYPE_GROUPS, ACTIVITY_TYPE_LABEL } from '@/features/activity/describe';
import { useProjectActivity, usePeople, type Person } from '@/features/activity/hooks';
import { useProjectMembers } from '@/features/projects/hooks';
import type { ActivityEventType, ProjectDetail } from '@/types/domain';

const PAGE_SIZE = 25;
const ALL_TYPES = new Set<string>(ACTIVITY_TYPE_GROUPS.flatMap((group) => group.types));

function parseType(value: string | null): ActivityEventType | undefined {
  return value && ALL_TYPES.has(value) ? (value as ActivityEventType) : undefined;
}

/** docs/PRODUCT.md "Actividad": a readable project timeline for anyone who can see the project. */
export function ProjectActivityPage() {
  const project = useOutletContext<ProjectDetail>();
  const [searchParams, setSearchParams] = useSearchParams();

  const type = parseType(searchParams.get('type'));
  const actorId = searchParams.get('actorId') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const membersQuery = useProjectMembers(project.id);
  const memberPeople = useMemo(
    () =>
      new Map<string, Person>(
        (membersQuery.data ?? []).map((member) => [
          member.userId,
          { firstName: member.user.firstName, lastName: member.user.lastName },
        ]),
      ),
    [membersQuery.data],
  );
  const { people, nameOf, ready } = usePeople(memberPeople);
  const activityQuery = useProjectActivity(project.id, { type, actorId, page, pageSize: PAGE_SIZE });

  function updateParams(changes: Record<string, string | undefined>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  const filtered = !!type || !!actorId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="activity-type">Tipo de cambio</Label>
          <Select value={type ?? 'ALL'} onValueChange={(value) => updateParams({ type: value === 'ALL' ? undefined : value, page: undefined })}>
            <SelectTrigger id="activity-type" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los cambios</SelectItem>
              {ACTIVITY_TYPE_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.types.map((groupType) => (
                    <SelectItem key={groupType} value={groupType}>
                      {ACTIVITY_TYPE_LABEL[groupType]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-actor">Persona</Label>
          <Select value={actorId ?? 'ALL'} onValueChange={(value) => updateParams({ actorId: value === 'ALL' ? undefined : value, page: undefined })}>
            <SelectTrigger id="activity-actor" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las personas</SelectItem>
              {(membersQuery.data ?? []).map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {fullName(member.user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QueryState
        query={{ ...activityQuery, isPending: activityQuery.isPending || !ready }}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={History}
            title={filtered ? 'Sin actividad para estos filtros' : 'Aún no hay actividad'}
            description={
              filtered ? 'Prueba con otro tipo de cambio o persona.' : 'Los cambios del proyecto aparecerán aquí.'
            }
          />
        }
      >
        {(data) => (
          <div className={cn('space-y-3', activityQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <ActivityFeed events={data.data} people={people} nameOf={nameOf} />
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
