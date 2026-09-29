import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';

/**
 * docs/PRODUCT.md: text, headings, bold, italic, lists, numbered lists,
 * links and checklists. Everything else StarterKit bundles (code, quotes,
 * strike, rules…) is switched off so notes stay simple and the stored JSON
 * only ever contains nodes the toolbar can produce.
 *
 * StarterKit v3 ships its own Link, so it is disabled here in favor of the
 * configured one (two extensions named `link` would collide).
 */
export function createNotesExtensions({ openLinks }: { openLinks: boolean }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      underline: false,
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
    }),
    Link.configure({
      openOnClick: openLinks,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    TaskList,
    TaskItem.configure({ nested: false }),
  ];
}
