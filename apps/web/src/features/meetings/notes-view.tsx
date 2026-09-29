import { useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import type { MeetingNotes } from '@/types/domain';
import { createNotesExtensions } from './notes-extensions';

/**
 * Read-only rendering of stored notes. The content is fixed for the lifetime
 * of the component: re-key it (e.g. by revision) to show different notes.
 */
export function NotesView({ content, label = 'Notas de la reunión' }: { content: MeetingNotes; label?: string }) {
  const extensions = useMemo(() => createNotesExtensions({ openLinks: true }), []);
  const editor = useEditor({
    extensions,
    content: content as JSONContent,
    editable: false,
    editorProps: { attributes: { 'aria-label': label, class: 'notes-content' } },
  });
  return <EditorContent editor={editor} />;
}
