import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTeam } from '@/features/users/hooks';
import { fullName } from '@/lib/utils';
import * as api from './api';
import type { NameOf } from './describe';

export function useProjectActivity(projectId: string, params: api.ListActivityParams) {
  return useQuery({
    queryKey: ['projects', projectId, 'activity', params],
    queryFn: () => api.listProjectActivity(projectId, params),
    placeholderData: keepPreviousData,
  });
}

export interface Person {
  firstName: string;
  lastName: string;
}

/**
 * Activity carries only actor ids, so names come from the active-team
 * directory (first 100 people) plus, when given, the project's members
 * (which also covers people who are no longer active). `ready` flips once
 * the directory has answered so the feed never flashes "unknown" names.
 */
export function usePeople(extra?: Map<string, Person>) {
  const team = useTeam({ pageSize: 100 });
  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const user of team.data?.data ?? []) map.set(user.id, { firstName: user.firstName, lastName: user.lastName });
    for (const [id, person] of extra ?? []) map.set(id, person);
    return map;
  }, [team.data, extra]);

  const nameOf: NameOf = useMemo(
    () => (userId) => {
      if (userId === null) return 'Alguien';
      const person = people.get(userId);
      return person ? fullName(person) : 'Un usuario';
    },
    [people],
  );

  return { people, nameOf, ready: !team.isPending };
}
