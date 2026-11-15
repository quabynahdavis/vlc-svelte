/**
 * Shared audio-file classification helpers.
 *
 * The video library's scan pipeline filters media Rust-side, so the TS side
 * historically never needed an extension list; the music library store scans
 * the same `scan_library_dir` output and keeps only audio files client-side.
 * The list mirrors the `audio` defaults in Settings > File Types
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

/**
 * Recognized video extensions (lowercase, without the dot). Used by the
 * native-video prototype gate in PlayerView; mirrors the video regex in
 * `thumbnails.ts` plus .wmv.
 */
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4',
  'm4v',
  'mkv',
  'webm',
  'mov',
  'avi',
  'wmv',
  'mpg',
  'mpeg',
  'ts',
  'ogv',
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

/**
 * True when `path` points at a LOCAL file with a recognized video extension.
 * The `/`-prefix check keeps network URLs (http/https/streams) out of the
 * native-video prototype — it only routes local files whose id is an
 * absolute path, matching how the library stores video track ids.
 */
export function isVideoFile(path: string): boolean {
  if (!path.startsWith('/')) return false;
  const extension = audioExtensionOf(path);
  return extension !== null && VIDEO_EXTENSIONS.has(extension);
}
