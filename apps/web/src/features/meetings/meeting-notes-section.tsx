import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/dates';
import type { MeetingDetail } from '@/types/domain';
import { NotesEditSession } from './notes-edit-session';
import { NotesView } from './notes-view';

export function MeetingNotesSection({
  projectId,
  meeting,
  onDirtyChange,
}: {
  projectId: string;
  meeting: MeetingDetail;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = meeting.viewerCapabilities.canEditNotes;

  return (
    <section aria-labelledby="meeting-notes-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="meeting-notes-heading" className="text-xs font-semibold uppercase text-muted-foreground">
          Notas
        </h3>
        {!editing && canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Editar notas
          </Button>
        )}
      </div>

      {editing ? (
        <NotesEditSession
          projectId={projectId}
          meeting={meeting}
          onDirtyChange={onDirtyChange}
          onExit={() => setEditing(false)}
        />
      ) : (
        <>
          {meeting.notes ? (
            // Re-keyed by revision so a save (or a newer version) re-renders the stored content.
            <NotesView key={meeting.revision} content={meeting.notes} />
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay notas para esta reunión.</p>
          )}
          {meeting.notesUpdatedAt && (
            <p className="text-xs text-muted-foreground">Guardadas el {formatDateTime(meeting.notesUpdatedAt)}.</p>
          )}
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Sólo los participantes con permiso de edición (y los managers del proyecto) pueden modificar las notas.
            </p>
          )}
        </>
      )}
    </section>
  );
}
