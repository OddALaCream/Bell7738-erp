import { BadRequestException } from '@nestjs/common';

const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);
const MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'underline',
  'link',
]);
const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 20;
const MAX_NODES = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validAttributes(type: string, attrs: unknown): boolean {
  if (attrs === undefined || attrs === null) return true;
  if (!isRecord(attrs)) return false;
  if (type === 'heading')
    return (
      onlyKeys(attrs, ['level']) &&
      Number.isInteger(attrs.level) &&
      Number(attrs.level) >= 1 &&
      Number(attrs.level) <= 6
    );
  if (type === 'orderedList')
    return (
      onlyKeys(attrs, ['start', 'type']) &&
      (attrs.start === undefined ||
        (Number.isInteger(attrs.start) && Number(attrs.start) > 0)) &&
      (attrs.type === undefined ||
        attrs.type === null ||
        ['1', 'a', 'A', 'i', 'I'].includes(String(attrs.type)))
    );
  if (type === 'codeBlock')
    return (
      onlyKeys(attrs, ['language']) &&
      (attrs.language === undefined ||
        attrs.language === null ||
        (typeof attrs.language === 'string' &&
          /^[\w+-]{1,32}$/.test(attrs.language)))
    );
  return Object.keys(attrs).length === 0;
}

function validMark(mark: unknown): boolean {
  if (
    !isRecord(mark) ||
    typeof mark.type !== 'string' ||
    !MARK_TYPES.has(mark.type) ||
    !onlyKeys(mark, ['type', 'attrs'])
  )
    return false;
  if (mark.type !== 'link') return validAttributes(mark.type, mark.attrs);
  if (
    !isRecord(mark.attrs) ||
    !onlyKeys(mark.attrs, ['href', 'target', 'rel', 'class'])
  )
    return false;
  const { href, target, rel, class: className } = mark.attrs;
  if (typeof href !== 'string' || href.length > 2048 || /\s/.test(href))
    return false;
  try {
    if (!['https:', 'http:', 'mailto:'].includes(new URL(href).protocol))
      return false;
  } catch {
    return false;
  }
  return (
    (target === undefined ||
      target === null ||
      target === '_blank' ||
      target === '_self') &&
    (rel === undefined ||
      rel === null ||
      (typeof rel === 'string' &&
        rel
          .split(' ')
          .every((token) =>
            ['noopener', 'noreferrer', 'nofollow'].includes(token),
          ))) &&
    (className === undefined || className === null)
  );
}

/** V1 Tiptap StarterKit + underline/link. Reject unknown extensions and HTML attributes. */
export function assertValidMeetingNotes(notes: unknown): void {
  let nodes = 0;
  const visit = (value: unknown, depth: number): boolean => {
    if (
      ++nodes > MAX_NODES ||
      depth > MAX_DEPTH ||
      !isRecord(value) ||
      !onlyKeys(value, ['type', 'attrs', 'content', 'text', 'marks'])
    )
      return false;
    const { type, content, text, marks } = value;
    if (
      typeof type !== 'string' ||
      !NODE_TYPES.has(type) ||
      (depth > 0 && type === 'doc') ||
      !validAttributes(type, value.attrs)
    )
      return false;
    if (type === 'text') {
      return (
        typeof text === 'string' &&
        text.length > 0 &&
        content === undefined &&
        (marks === undefined ||
          (Array.isArray(marks) && marks.every(validMark)))
      );
    }
    if (text !== undefined || marks !== undefined) return false;
    if (['hardBreak', 'horizontalRule'].includes(type))
      return content === undefined;
    return (
      content === undefined ||
      (Array.isArray(content) &&
        content.every((child) => visit(child, depth + 1)))
    );
  };
  if (
    !isRecord(notes) ||
    notes.type !== 'doc' ||
    Buffer.byteLength(JSON.stringify(notes)) > MAX_BYTES ||
    !visit(notes, 0)
  ) {
    throw new BadRequestException(
      'notes must be a supported Tiptap document within the size and depth limits.',
    );
  }
}
