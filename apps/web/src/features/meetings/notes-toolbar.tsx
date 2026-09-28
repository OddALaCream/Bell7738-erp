import { useState, type FormEvent, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeLinkHref } from './notes-links';

function ToolbarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** docs/UI-UX.md "Toolbar mínima": paragraph/headings, bold, italic, lists, checklist, link. */
export function NotesToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      paragraph: current?.isActive('paragraph') ?? false,
      h1: current?.isActive('heading', { level: 1 }) ?? false,
      h2: current?.isActive('heading', { level: 2 }) ?? false,
      h3: current?.isActive('heading', { level: 3 }) ?? false,
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
      taskList: current?.isActive('taskList') ?? false,
      link: current?.isActive('link') ?? false,
    }),
  });

  function openLink() {
    setLinkValue((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink(event: FormEvent) {
    event.preventDefault();
    if (!linkValue.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = normalizeLinkHref(linkValue);
    if (!href) {
      setLinkError('Ingresa una dirección http(s) o mailto válida.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  }

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="Formato de las notas" className="flex flex-wrap items-center gap-0.5">
        <ToolbarButton label="Párrafo" active={active.paragraph} onClick={() => editor.chain().focus().setParagraph().run()}>
          <Pilcrow />
        </ToolbarButton>
        <ToolbarButton label="Encabezado 1" active={active.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 />
        </ToolbarButton>
        <ToolbarButton label="Encabezado 2" active={active.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton label="Encabezado 3" active={active.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Negrita" active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </ToolbarButton>
        <ToolbarButton label="Cursiva" active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Lista con viñetas" active={active.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List />
        </ToolbarButton>
        <ToolbarButton label="Lista numerada" active={active.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="Lista de tareas" active={active.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Enlace" active={active.link} onClick={openLink}>
          <Link2 />
        </ToolbarButton>
        {active.link && (
          <ToolbarButton label="Quitar enlace" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
            <Unlink />
          </ToolbarButton>
        )}
      </div>

      {linkOpen && (
        <form onSubmit={applyLink} className="space-y-1" noValidate>
          <div className="flex gap-2">
            <Input
              aria-label="Dirección del enlace"
              aria-invalid={!!linkError}
              aria-describedby={linkError ? 'notes-link-error' : undefined}
              placeholder="https://…"
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm">
              Aplicar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
              Cancelar
            </Button>
          </div>
          {linkError && (
            <p id="notes-link-error" className="text-sm text-destructive">
              {linkError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
