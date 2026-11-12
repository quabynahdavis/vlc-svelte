/**
 * Shared audio-file classification helpers.
 *
 * The video library's scan pipeline filters media Rust-side, so the TS side
 * never needed an extension list; the music library store scans the same
 * `scan_library_dir` output and keeps only audio files client-side. The list
 * mirrors the `audio` defaults in Settings > File Types
 * (`settings.ts` `DEFAULT_FILE_TYPES.audio`) plus a few common formats the
 * Rust metadata reader supports.
 */

/** Recognized audio extensions (lowercase, without the dot). */
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'flac',
  'ogg',
  'oga',
  'wav',
  'aac',
  'm4a',
  'wma',
  'opus',
  'ape',
  'aiff',
  'aif',
  'alac',
  'mka',
  'mpc',
  'wv',
  'dsf',
]);

/** Case-insensitive extension of `path` (without the dot), or null. */
export function audioExtensionOf(path: string): string | null {
  const match = /\.([^.\\/]+)$/.exec(path);
  return match ? match[1].toLowerCase() : null;
}

/** True when `path` points at a file with a recognized audio extension. */
export function isAudioFile(path: string): boolean {
  const extension = audioExtensionOf(path);
  return extension !== null && AUDIO_EXTENSIONS.has(extension);
}
