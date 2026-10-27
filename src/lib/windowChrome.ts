/**
 * Window chrome helpers.
 *
 * The app can either draw its own title bar (window decorations off) or fall
 * back to the native OS title bar (decorations on). Only the desktop shell can
 * change decorations, so every helper here degrades to a no-op in the browser.
 */

/**
 * Apply the requested title bar style to the current window.
 *
 * `@tauri-apps/api/window` is imported lazily so the browser preview never pays
 * for (or crashes on) the Tauri runtime.
 *
 * @param useSystem `true` shows the native window decorations (system title
 *   bar), `false` hides them so the in-app custom title bar is the only chrome.
 * @returns `true` when the desktop window accepted the change, `false` in a
 *   plain browser or when the call is rejected.
 */
export async function applyWindowDecorations(useSystem: boolean): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    // System title bar == native decorations ON, custom title bar == OFF.
    await getCurrentWindow().setDecorations(!useSystem);
    return true;
  } catch (error) {
    // Expected outside the Tauri shell: the browser preview keeps its own chrome.
    console.warn(
      'Window decorations can only be changed inside the desktop shell.',
      error,
    );
    return false;
  }
}
