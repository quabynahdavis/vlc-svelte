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

/**
 * Filesystem path inside a Tauri `convertFileSrc` URL
 * (`asset://localhost/%2F…` or `http://asset.localhost/%2F…`).
 * The path is the percent-encoded remainder after the host slash.
 */
export function pathFromAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(?:asset:\/\/[^/?#]+\/|https?:\/\/asset\.localhost(?::\d+)?\/)([^?#]*)/i.exec(
    value.trim(),
  );
  if (!match) return null;
  try {
    const path = decodeURIComponent(match[1]);
    if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return path;
  } catch {
    return null;
  }
  return null;
}

/** Absolute path stored in front of an embedded asset URL (`path:asset://…:native`). */
function peelEmbeddedMediaPath(value: string): string | null {
  const index = value.search(/:(?=asset:\/\/|https?:\/\/asset\.localhost\b)/i);
  if (index <= 0) return null;
  return value.slice(0, index);
}

/**
 * Local file libvlc may open. A bare absolute path passes through.
 * An asset URL is decoded. A watch key that glues the path, the asset URL,
 * and `:native` / `:html5` together yields the path. Anything else is null
 * so a thumbnail, blob, or asset URL is not handed to libvlc as a location.
 */
export function nativeFileLocation(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isVideoFile(trimmed) || isAudioFile(trimmed)) return trimmed;
  const peeled = peelEmbeddedMediaPath(trimmed);
  if (peeled && (isVideoFile(peeled) || isAudioFile(peeled))) return peeled;
  const fromAsset = pathFromAssetUrl(trimmed);
  if (fromAsset && (isVideoFile(fromAsset) || isAudioFile(fromAsset))) return fromAsset;
  return null;
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
  // Tauri's asset host is a file, not a network stream. Opening it as HTTP
  // never reads the movie.
  if (parsed.hostname === 'asset.localhost') return null;
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
