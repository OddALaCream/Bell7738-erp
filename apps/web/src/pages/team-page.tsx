import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { useTeam } from '@/features/users/hooks';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fullName } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export function TeamPage() {
  useSetBreadcrumb('Equipo');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useTeam({ search: debouncedSearch || undefined, pageSize: 60 });

  function handleSearchChange(value: string) {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">Equipo</h1>
        <p className="text-sm text-muted-foreground">Directorio de personas activas en la organización.</p>
      </div>

      <Input
        placeholder="Buscar por nombre…"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="max-w-sm"
      />

      <QueryState
        query={query}
        skeleton={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        }
        emptyWhen={(data) => data.data.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title={debouncedSearch ? 'Sin resultados' : 'Aún no hay compañeros activos'}
            description={debouncedSearch ? 'Prueba con otro nombre.' : undefined}
          />
        }
      >
        {(data) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((member) => (
              <Card
                key={member.id}
                className="cursor-pointer transition-colors hover:bg-accent"
                onClick={() => navigate(`/users/${member.id}/profile`)}
              >
                <CardContent className="flex items-center gap-3 py-4">
                  <UserAvatar firstName={member.firstName} lastName={member.lastName} className="size-10" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fullName(member)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
