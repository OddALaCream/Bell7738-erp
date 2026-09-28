import { assertValidMeetingNotes } from './meeting-notes.js';

const linkDoc = (href: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href } }],
        },
      ],
    },
  ],
});

describe('Meeting notes validation', () => {
  it.each([
    'https://example.com',
    'http://localhost',
    'mailto:team@example.test',
  ])('allows supported link %s', (href) => {
    expect(() => assertValidMeetingNotes(linkDoc(href))).not.toThrow();
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'java\nscript:alert(1)',
    '//example.test',
  ])('rejects unsafe link %s', (href) => {
    expect(() => assertValidMeetingNotes(linkDoc(href))).toThrow();
  });
  it.each([
    { text: 'arbitrary JSON' },
    {
      type: 'doc',
      content: [{ type: 'html', attrs: { html: '<script>1</script>' } }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }],
    },
    {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'data:text/html,evil' } }],
    },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 99 } }] },
  ])('rejects unknown content and attributes', (notes) => {
    expect(() => assertValidMeetingNotes(notes)).toThrow();
  });
  it('bounds content size and nesting depth', () => {
    expect(() =>
      assertValidMeetingNotes({
        type: 'doc',
        content: [{ type: 'text', text: 'x'.repeat(65536) }],
      }),
    ).toThrow();
    let nested: Record<string, unknown> = { type: 'paragraph' };
    for (let i = 0; i < 21; i++)
      nested = { type: 'blockquote', content: [nested] };
    expect(() =>
      assertValidMeetingNotes({ type: 'doc', content: [nested] }),
    ).toThrow();
  });
});
