/**
 * Copies formatted content so it pastes back into a rich editor with its
 * structure (text/html), falling back to plain text where `ClipboardItem`
 * isn't available. Returns false if the browser refuses (permissions,
 * insecure context) so callers can tell the user.
 */
export async function copyRichText(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    return false;
  }
}
