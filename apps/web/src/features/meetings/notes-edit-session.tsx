import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-types';
import { copyRichText } from '@/lib/clipboard';
import { formatDateTime } from '@/lib/dates';
import type { MeetingDetail, MeetingNotes } from '@/types/domain';
import * as api from './api';
import { meetingKeys, useUpdateMeetingNotes } from './hooks';
import { createNotesExtensions } from './notes-extensions';
import { NotesToolbar } from './notes-toolbar';
import { NotesView } from './notes-view';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Conflict {
  currentRevision?: number;
  updatedAt?: string | null;
}

/** A draft set aside when the user reloads the latest version after a conflict. */
interface StashedDraft {
  id: number;
  json: MeetingNotes;
  html: string;
  text: string;
}

const SHORTCUTS_ID = 'notes-shortcuts';

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Ya no tienes permiso para editar estas notas. Tu borrador sigue aquí: cópialo antes de salir.';
    if (error.status === 404) return 'La reunión ya no existe. Tu borrador sigue aquí: cópialo antes de salir.';
    if (error.code === 'NETWORK_ERROR') return 'No se pudo conectar con el servidor. Tu borrador sigue aquí; inténtalo de nuevo.';
    return error.message;
  }
  return 'No se pudieron guardar las notas.';
}

/**
 * Explicit-save notes editing (docs/UI-UX.md: no autosave, no real-time
 * collaboration). Every save sends the revision the draft was based on. If
 * someone else saved first the API answers REVISION_CONFLICT; the draft is
 * never dropped, saving is blocked until the latest version is reloaded, and
 * there is deliberately no "overwrite" action. Reloading the latest version
 * sets the old draft aside (read-only, copyable) so it can be re-applied by hand.
 */
export function NotesEditSession({
  projectId,
  meeting,
  onExit,
  onDirtyChange,
}: {
  projectId: string;
  meeting: MeetingDetail;
  onExit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const updateNotes = useUpdateMeetingNotes(projectId, meeting.id);
  const extensions = useMemo(() => createNotesExtensions({ openLinks: false }), []);

  const [baseRevision, setBaseRevision] = useState(meeting.revision);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [reloading, setReloading] = useState(false);
  const [stashed, setStashed] = useState<StashedDraft[]>([]);
  const [confirmingExit, setConfirmingExit] = useState(false);

  const editor = useEditor({
    extensions,
    content: (meeting.notes ?? undefined) as JSONContent | undefined,
    onUpdate: () => {
      setDirty(true);
      setStatus((current) => (current === 'saved' || current === 'error' ? 'idle' : current));
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Notas de la reunión',
        'aria-describedby': SHORTCUTS_ID,
        class:
          'notes-content min-h-40 rounded-md border border-input bg-background p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      },
    },
  });

  const hasUnsaved = dirty || stashed.length > 0;

  useEffect(() => {
    onDirtyChange(hasUnsaved);
    return () => onDirtyChange(false);
  }, [hasUnsaved, onDirtyChange]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  const copy = useCallback(async (html: string, text: string) => {
    const ok = await copyRichText(html, text);
    if (ok) toast.success('Borrador copiado.');
    else toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
  }, []);

  async function save() {
    if (!editor || conflict) return;
    setStatus('saving');
    setErrorMessage(null);
    try {
      const updated = await updateNotes.mutateAsync({ notes: editor.getJSON(), expectedRevision: baseRevision });
      setBaseRevision(updated.revision);
      setDirty(false);
      setStatus('saved');
    } catch (error) {
      setStatus('error');
      if (error instanceof ApiError && error.isRevisionConflict) {
        setConflict({ currentRevision: error.currentRevision, updatedAt: error.updatedAt });
      } else {
        setErrorMessage(saveErrorMessage(error));
      }
    }
  }

  async function reloadLatest() {
    if (!editor) return;
    setReloading(true);
    setErrorMessage(null);
    try {
      const latest = await queryClient.fetchQuery({
        queryKey: meetingKeys.detail(projectId, meeting.id),
        queryFn: () => api.getMeeting(projectId, meeting.id),
        staleTime: 0,
      });
      // Read the draft NOW, before the editor content is replaced: a state updater runs later,
      // by which time `editor` would already hold the other person's version.
      const draft = {
        json: editor.getJSON(),
        html: editor.getHTML(),
        text: editor.getText({ blockSeparator: '\n' }),
      };
      // Kept visible and copyable until the user explicitly discards it.
      setStashed((current) => [...current, { id: (current[current.length - 1]?.id ?? 0) + 1, ...draft }]);
      editor.commands.setContent((latest.notes ?? '') as JSONContent, { emitUpdate: false });
      setBaseRevision(latest.revision);
      setConflict(null);
      setDirty(false);
      setStatus('idle');
    } catch (error) {
      setErrorMessage(saveErrorMessage(error));
    } finally {
      setReloading(false);
    }
  }

  function requestExit() {
    if (hasUnsaved) setConfirmingExit(true);
    else onExit();
  }

  const statusText =
    status === 'saving'
      ? 'Guardando…'
      : status === 'saved'
        ? 'Guardado'
        : status === 'error'
          ? 'No se guardó'
          : dirty
            ? 'Cambios sin guardar'
            : 'Sin cambios';

  if (!editor) return null;

  return (
    <div className="space-y-3">
      <NotesToolbar editor={editor} />
      <EditorContent editor={editor} />
      <p id={SHORTCUTS_ID} className="text-xs text-muted-foreground">
        Atajos: Ctrl/⌘+B negrita · Ctrl/⌘+I cursiva · Ctrl/⌘+Alt+1/2/3 encabezados · Ctrl/⌘+Shift+8 lista · Ctrl/⌘+Shift+7 lista
        numerada · Ctrl/⌘+Shift+9 lista de tareas.
      </p>

      {conflict && (
        <div role="alert" className="space-y-3 rounded-lg border border-warning bg-warning/10 p-3 text-sm">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Otra persona guardó cambios en las notas mientras editabas.
          </p>
          <p className="text-muted-foreground">
            Su versión es la revisión {conflict.currentRevision ?? '—'}
            {conflict.updatedAt ? `, guardada el ${formatDateTime(conflict.updatedAt)}` : ''}. Tu borrador sigue aquí y no se ha
            perdido. Recarga la última versión y vuelve a aplicar tus cambios; si quieres conservarlo, cópialo antes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => copy(editor.getHTML(), editor.getText({ blockSeparator: '\n' }))}>
              <Copy /> Copiar mi borrador
            </Button>
            <Button type="button" size="sm" loading={reloading} onClick={reloadLatest}>
              <RefreshCw /> Recargar la última versión
            </Button>
          </div>
        </div>
      )}

      {stashed.map((draft, index) => (
        <details key={draft.id} className="rounded-lg border border-border p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Tu borrador anterior{stashed.length > 1 ? ` (${index + 1})` : ''} — solo lectura
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted-foreground">
              Estos son tus cambios sin guardar de antes de recargar. Vuelve a aplicarlos en el editor de arriba.
            </p>
            <div className="rounded-md bg-muted/40 p-3">
              <NotesView content={draft.json} label={`Borrador anterior ${index + 1}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => copy(draft.html, draft.text)}>
                <Copy /> Copiar borrador
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStashed((current) => current.filter((item) => item.id !== draft.id))}
              >
                Descartar este borrador
              </Button>
            </div>
          </div>
        </details>
      ))}

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {statusText}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={requestExit}>
            {hasUnsaved ? 'Cancelar' : 'Cerrar edición'}
          </Button>
          <Button type="button" onClick={save} loading={status === 'saving'} disabled={!dirty || !!conflict}>
            Guardar notas
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingExit}
        onOpenChange={setConfirmingExit}
        title="¿Salir sin guardar?"
        description={
          <>
            {dirty && 'Tienes cambios sin guardar en las notas. '}
            {stashed.length > 0 && 'Hay borradores anteriores que aún no descartaste. '}
            Si sales ahora se perderán.
          </>
        }
        confirmLabel="Salir y descartar"
        variant="destructive"
        onConfirm={onExit}
      />
    </div>
  );
}
