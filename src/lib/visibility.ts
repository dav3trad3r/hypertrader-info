// Background tabs should not poll. A visitor who leaves the tracker open in a
// background tab kept every refresh loop running: 2026-10-28 that was ~6,400
// Papertrade proxy calls a day from about eight people, plus Hyperliquid and
// mark polling. Pollers skip their tick while the page is hidden and refresh
// once when it is shown again.

/** True while the page is in a background tab or a minimised window. */
export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Run `fn` whenever the page becomes visible again. Returns an unsubscribe. */
export function onPageVisible(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => {
    if (document.visibilityState === 'visible') fn();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
