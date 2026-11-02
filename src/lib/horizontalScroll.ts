/**
 * Wheel handling for horizontal rails nested inside wheel-sensitive areas
 * (for example the player stage, where wheel events control volume).
 */

/**
 * Scroll a horizontal rail with the wheel only when the gesture is clearly
 * horizontal: either Shift+wheel or a dominant horizontal delta.
 *
 * Non-horizontal wheel events are deliberately left untouched so the page
 * (or an outer vertical scroller) keeps its normal behaviour.
 */
export function handleHorizontalWheel(event: WheelEvent): void {
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement)) return;

  const horizontalIntent = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
  if (!horizontalIntent) return;

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, el.scrollLeft + delta));

  event.preventDefault();
  event.stopPropagation();

  // Apply immediately: smooth scrolling per wheel tick feels laggy on trackpads.
  el.scrollLeft = nextScrollLeft;
}

/** Move a horizontal rail by roughly one viewport, used by the arrow buttons. */
export function scrollRailBy(el: HTMLElement | null, direction: -1 | 1): void {
  if (!el || el.scrollWidth <= el.clientWidth) return;

  el.scrollBy({
    left: direction * el.clientWidth * 0.8,
    behavior: 'smooth',
  });
}
