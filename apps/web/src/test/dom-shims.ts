/**
 * jsdom has no layout engine. These stubs cover the browser APIs that
 * ProseMirror (Tiptap) and the app's media-query hook call, so components
 * that use them can mount in component tests. They return "nothing measured",
 * which is enough: the tests assert behavior and text, not geometry.
 */
export function installDomShims(options: { matchesMedia?: boolean } = {}): void {
  const zeroRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  const emptyRects = { length: 0, item: () => null, [Symbol.iterator]: function* () {} } as unknown as DOMRectList;

  Range.prototype.getBoundingClientRect = () => zeroRect;
  Range.prototype.getClientRects = () => emptyRects;
  document.elementFromPoint = () => null;
  Element.prototype.scrollIntoView = () => {};

  window.matchMedia = (query: string) =>
    ({
      matches: options.matchesMedia ?? false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}
