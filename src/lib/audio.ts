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
 * The `/`-prefix check keeps network URLs out of the local-video route.
 * Streams are classified separately by {@link streamLocationOf}.
 */
export function isVideoFile(path: string): boolean {
  if (!path.startsWith('/')) return false;
  const extension = audioExtensionOf(path);
  return extension !== null && VIDEO_EXTENSIONS.has(extension);
}

/** Schemes the native backend will open. Mirrors `classify_media_target` in Rust. */
const STREAM_PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'rtsp:',
  'rtsps:',
  'rtmp:',
  'rtmps:',
  'mms:',
  'mmsh:',
  'rtp:',
  'udp:',
]);

/** Protocols that are video-shaped even when the path has no extension. */
const VISUAL_STREAM_PROTOCOLS: ReadonlySet<string> = new Set([
  'rtsp:',
  'rtsps:',
  'rtmp:',
  'rtmps:',
  'mms:',
  'mmsh:',
  'rtp:',
]);

const VISUAL_STREAM_EXTENSIONS: ReadonlySet<string> = new Set([
  ...VIDEO_EXTENSIONS,
  'm3u8',
  'm3u',
  'mpd',
]);

/**
 * Canonical href when `value` is an allowlisted stream URL, otherwise null.
 * `file:` and anything else stay null so local playback keeps using paths.
 */
export function streamLocationOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!STREAM_PROTOCOLS.has(parsed.protocol)) return null;
  if (!parsed.hostname) return null;
  return parsed.href;
}

/**
 * True when a stream should use the video frame pump. HTTP progressive audio
 * (no video/playlist extension) stays audio-only so a radio URL does not
 * cover the stage with an empty canvas.
 */
export function isVisualStream(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (VISUAL_STREAM_PROTOCOLS.has(parsed.protocol)) return true;
  const extension = audioExtensionOf(parsed.pathname);
  return extension !== null && VISUAL_STREAM_EXTENSIONS.has(extension);
}
