/**
 * Container duration for scanned library items.
 *
 * Desktop: `media_duration` reads a SQLite cache then probes with ffmpeg,
 * because a detached webview `<video>` cannot load most `asset://` / MKV
 * sources for metadata. Browser sessions and blob imports keep the HTML
 * element probe as a fallback.
 */
import { hasTauri, invokeCommand } from './tauriFs';

const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|[/\\])/;

export function isAbsoluteMediaPath(id: string): boolean {
  return ABSOLUTE_PATH.test(id);
}

/** Seconds from the native cache/probe, or null when unknown. */
export async function readMediaDuration(path: string): Promise<number | null> {
  if (!hasTauri() || !isAbsoluteMediaPath(path)) return null;
  const value = await invokeCommand<number | null>('media_duration', { path });
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
