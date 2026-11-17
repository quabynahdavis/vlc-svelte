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

/** True when `path` ends in a video extension, including URLs and asset srcs. */
export function hasVideoExtension(path: string): boolean {
  const extension = audioExtensionOf(path);
  return extension !== null && VIDEO_EXTENSIONS.has(extension);
}

/** Player track fields the waveform seekbar can see. `kind` / `mime` are optional. */
export type WaveformTrackHint = {
  id?: string;
  src?: string;
  title?: string;
  kind?: string | null;
  mime?: string | null;
};

/** Music-library row the seekbar can resolve back to a filesystem path. */
export type WaveformLibraryTrack = {
  id: string;
  path: string;
};

function labelOf(track: WaveformTrackHint, key: 'kind' | 'mime'): string {
  const value = track[key];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isAbsoluteFilePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

/**
 * Absolute audio path the Rust waveform commands can decode.
 * Video containers are rejected even when the string also looks like audio.
 */
function localAudioPath(value: string): string | null {
  if (!isAbsoluteFilePath(value) || hasVideoExtension(value) || !isAudioFile(value)) return null;
  return value;
}

/**
 * `convertFileSrc` URLs (`asset://` / `http://asset.localhost/...`) back to a
 * local audio path. Anything else (blob, http stream, video) is ignored.
 */
function audioPathFromAssetSrc(src: string): string | null {
  try {
    const url = new URL(src);
    const isAsset = url.protocol === 'asset:' || url.hostname === 'asset.localhost';
    if (!isAsset) return null;
    return localAudioPath(decodeURIComponent(url.pathname));
  } catch {
    return null;
  }
}

/**
 * True when the transport should use the waveform seekbar for this track.
 * Video files win even if they contain an audio stream or sit in a music queue.
 * Audio is a music-library id, an audio extension on the id or src, or an
 * explicit audio/music kind or `audio/*` mime when one is present.
 */
export function trackUsesWaveform(
  track: WaveformTrackHint | null | undefined,
  library: readonly WaveformLibraryTrack[] = [],
): boolean {
  if (!track) return false;

  const kind = labelOf(track, 'kind');
  const mime = labelOf(track, 'mime');
  const id = track.id ?? '';
  const src = track.src ?? '';

  if (kind === 'video' || mime.startsWith('video/')) return false;
  if ((id && hasVideoExtension(id)) || (src && hasVideoExtension(src))) return false;

  if (kind === 'audio' || kind === 'music' || mime.startsWith('audio/')) return true;
  if ((id && isAudioFile(id)) || (src && isAudioFile(src))) return true;

  if (!id) return false;
  return library.some((item) => item.id === id || item.path === id);
}

/**
 * Filesystem path passed to `waveform_get` / `waveform_generate`.
 * Null for video, streams, and audio that has no local file to decode —
 * the seekbar then keeps the plain progress bar.
 */
export function waveformFilePath(
  track: WaveformTrackHint | null | undefined,
  library: readonly WaveformLibraryTrack[] = [],
): string | null {
  if (!trackUsesWaveform(track, library) || !track) return null;

  const id = track.id ?? '';
  const fromId = id ? localAudioPath(id) : null;
  if (fromId) return fromId;

  const fromLibrary = library.find((item) => item.id === id || item.path === id);
  const fromLibraryPath = fromLibrary ? localAudioPath(fromLibrary.path) : null;
  if (fromLibraryPath) return fromLibraryPath;

  const src = track.src ?? '';
  return (src ? localAudioPath(src) : null) ?? audioPathFromAssetSrc(src);
}
