import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTeam } from '@/features/users/hooks';
import { fullName } from '@/lib/utils';
import type { ProjectRole } from '@/types/domain';
import { useAddProjectMember } from './hooks';
import { PROJECT_ROLE_LABEL } from './labels';

export function AddMemberDialog({
  open,
  onOpenChange,
  projectId,
  existingUserIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingUserIds: Set<string>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <AddMemberForm projectId={projectId} existingUserIds={existingUserIds} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({
  projectId,
  existingUserIds,
  onOpenChange,
}: {
  projectId: string;
  existingUserIds: Set<string>;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const [error, setError] = useState<string | null>(null);
  const teamQuery = useTeam({ search: debouncedSearch || undefined, pageSize: 20 });
  const addMember = useAddProjectMember(projectId);

  const candidates = (teamQuery.data?.data ?? []).filter((u) => !existingUserIds.has(u.id));

  async function handleSubmit() {
    if (!userId) return;
    setError(null);
    try {
      await addMember.mutateAsync({ userId, role });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Esa persona ya es miembro activo del proyecto.');
      } else if (err instanceof ApiError && err.status === 400) {
        setError('El usuario debe estar activo para unirse al proyecto.');
      } else {
        setError('No se pudo añadir al miembro.');
      }
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Añadir miembro</DialogTitle>
        <DialogDescription>Busca entre las personas activas de la organización.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <Input placeholder="Buscar por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {candidates.length === 0 && <p className="p-2 text-sm text-muted-foreground">Sin resultados.</p>}
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setUserId(candidate.id)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${userId === candidate.id ? 'bg-accent' : ''}`}
            >
              {fullName(candidate)}
            </button>
          ))}
        </div>

        <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VIEWER">{PROJECT_ROLE_LABEL.VIEWER}</SelectItem>
            <SelectItem value="MEMBER">{PROJECT_ROLE_LABEL.MEMBER}</SelectItem>
            <SelectItem value="MANAGER">{PROJECT_ROLE_LABEL.MANAGER}</SelectItem>
          </SelectContent>
        </Select>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" disabled={!userId} loading={addMember.isPending} onClick={handleSubmit}>
          Añadir
        </Button>
      </DialogFooter>
    </>
  );
}
