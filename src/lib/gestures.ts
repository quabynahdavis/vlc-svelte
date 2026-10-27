/**
 * Shared pointer-gesture helpers for the player stage.
 *
 * PlayerView owns click / double-click / wheel handling, while TransportBar
 * reuses the fullscreen helper so the toolbar button, the `f` shortcut and
 * the stage double-click all target the same element.
 */

/** Delay before a lone stage click toggles playback, so a double-click can win. */
export const DOUBLE_CLICK_DELAY_MS = 250;

/** How long the volume HUD stays visible after the last wheel notch. */
export const VOLUME_HUD_DURATION_MS = 800;

/** Volume percentage change per mouse-wheel notch. */
export const WHEEL_VOLUME_STEP = 4;

/** Finer wheel step while Shift is held. */
export const WHEEL_VOLUME_FINE_STEP = 1;

/**
 * Convert a wheel event into fractional notches (positive = scroll down).
 *
 * Pixel, line and page delta modes are normalised so trackpads and classic
 * wheels feel similar, and one event never counts as more than one notch.
 * The horizontal fallback covers platforms that report Shift+wheel as
 * sideways scrolling.
 */
export function wheelNotches(event: WheelEvent): number {
  const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
  if (delta === 0) return 0;

  const unit = event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 40;
  return Math.sign(delta) * Math.min(1, Math.abs(delta) / unit);
}

/** Enter or leave fullscreen for the stage (or the media element's parent). */
export function toggleFullscreen(target: HTMLElement | null): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {
      // Browsers can refuse to leave fullscreen if the document is not focused.
    });
    return;
  }

  if (target) {
    void target.requestFullscreen().catch((error) => {
      console.warn('Fullscreen is unavailable.', error);
    });
  }
}
