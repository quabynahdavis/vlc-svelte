/**
 * Real music library store (Phase 3).
 *
 * Scans the configured music roots (`settings.musicLibraryFolders`) with the
 * same `scan_library_dir` pipeline the video library uses, keeps only audio
 * files, enriches every file with `read_audio_metadata` and groups the result
 * by artist / album / genre. Track ids are the absolute file paths (same
 * convention as scanned video items), which also makes them directly usable
 * as `mediaKey` values for history entries.
 *
 * The enriched track list is persisted under `vlc.musicLibrary.v1` and
 * rehydrated at boot so the Music tab has data before the first scan lands;
 * a completed scan replaces the persisted slice for its root.
 *
 * Covers stay a lazy session cache (`ensureMusicCover`) exactly like the
 * video thumbnails in `thumbnails.ts`: object URLs are created on demand and
 * never persisted.
 */
import { derived, get, writable, type Readable } from 'svelte/store';
import { settings, settingsHydrated } from './settings';
import { hasTauri, invokeCommand, toFileSrc, type ScanResult, type ScannedFile } from '../lib/tauriFs';
import { coverExtract, coverGet, readAudioMetadata } from '../lib/audioMeta';
import { isAudioFile } from '../lib/audio';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { recordHistory, type HistoryEntry } from './history';
import { isUnderRoot } from './library';
import type { Track } from './player';

/* ---------- Domain model ---------- */

/** Fallback bucket for tracks whose artist tag is missing. */
export const UNKNOWN_ARTIST = 'Unknown Artist';
/** Fallback genre bucket for tracks without a genre tag. */
export const UNKNOWN_GENRE = 'Unknown Genre';

export interface MusicTrack {
  /** Absolute file path — stable per file, doubles as the history mediaKey. */
  id: string;
  /** Absolute file path of the audio file. */
  path: string;
  /** Tauri asset-protocol URL; derived after hydration, never persisted. */
  src: string;
  /** Tag title, or the filename without extension. */
  title: string;
  /** Tag artist, or `'Unknown Artist'`. */
  artist: string;
  /** Tag album artist falling back to the artist tag. */
  albumArtist: string;
  /** Tag album, or the basename of the containing folder. */
  album: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  genre: string | null;
  /** Tag duration in seconds, 0 while unknown. */
  durationSeconds: number;
  /** Whether the Rust metadata reader saw embedded artwork. */
  hasCover: boolean;
}

/* ---------- Small path/text helpers (local so the store is self-contained) ---------- */

function trimTrailingSeparator(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function basenameOf(path: string): string {
  const parts = trimTrailingSeparator(path).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** Basename of the directory containing `path` — the folder-name album fallback. */
function folderLabelFor(path: string): string {
  const parts = trimTrailingSeparator(path).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 2] ?? '';
}

/** Filename without its extension, used as the title fallback. */
function titleFromFilename(name: string): string {
  return name.replace(/\.[^.\\/]+$/, '');
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/* ---------- Persistence ---------- */

const STORAGE_KEY = 'vlc.musicLibrary.v1';
const writeMusicLibrary = createKeyWriter(STORAGE_KEY);

/** Set when a scan mutation lands before the SQLite snapshot has been applied. */
let changedSinceBoot = false;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

/**
 * Validate one persisted track. `src` is deliberately absent — it is derived
 * from `path` via `toFileSrc` after hydration so blob/asset URLs never touch
 * the persistence layer.
 */
function sanitizePersistedTrack(value: unknown): Omit<MusicTrack, 'src'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const path = asString(record.path) ?? asString(record.id);
  if (!path) return null;
  return {
    id: path,
    path,
    title: asString(record.title) ?? titleFromFilename(basenameOf(path)),
    artist: asString(record.artist) ?? UNKNOWN_ARTIST,
    albumArtist: asString(record.albumArtist) ?? asString(record.artist) ?? UNKNOWN_ARTIST,
    album: asString(record.album) ?? folderLabelFor(path),
    year: asNullableNumber(record.year),
    trackNumber: asNullableNumber(record.trackNumber),
    discNumber: asNullableNumber(record.discNumber),
    genre: asString(record.genre),
    durationSeconds: Math.max(0, asNullableNumber(record.durationSeconds) ?? 0),
    hasCover: record.hasCover === true,
  };
}

function sanitizePersistedTracks(value: unknown): Array<Omit<MusicTrack, 'src'>> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Array<Omit<MusicTrack, 'src'>> = [];
  for (const item of value) {
    const track = sanitizePersistedTrack(item);
    if (!track || seen.has(track.path)) continue;
    seen.add(track.path);
    out.push(track);
  }
  return out;
}

/* ---------- Store ---------- */

/** Backing writable; mutations persist the plain path-keyed shape. */
const store = writable<MusicTrack[]>([]);

function persist(tracks: MusicTrack[]): void {
  changedSinceBoot = true;
  void writeMusicLibrary(
    JSON.stringify(tracks.map(({ src: _src, ...rest }) => rest)),
  );
}

function setTracks(next: MusicTrack[]): void {
  store.set(next);
  persist(next);
}

function replaceTracksForRoot(rootPath: string, tracks: MusicTrack[]): void {
  store.update((current) => [
    ...current.filter((track) => !isUnderRoot(track.path, rootPath)),
    ...tracks,
  ]);
  persist(get(store));
}

/**
 * Drop tracks that no longer live under any configured music root, so a
 * removed root disappears instead of lingering in the persisted list.
 */
function pruneRemovedRoots(configuredRoots: string[]): void {
  const current = get(store);
  const kept = current.filter((track) =>
    configuredRoots.some((root) => isUnderRoot(track.path, root)),
  );
  if (kept.length !== current.length) setTracks(kept);
}

/**
 * Readable view of the flat enriched track list. Order follows scan order
 * (configured root order, files within a root in scan order).
 */
export const musicTracks: Readable<MusicTrack[]> = { subscribe: store.subscribe };

// Desktop hydration: swap in the persisted snapshot so the Music tab shows
// data immediately, before the first scan finishes. A snapshot is skipped
// when scan mutations already landed (`changedSinceBoot`) so a late read can
// never overwrite fresh scan results. Asset URLs are re-derived per track.
if (hasTauri()) {
  void (async () => {
    const raw = await loadPersistedRaw(STORAGE_KEY);
    if (raw === null || changedSinceBoot) return;
    try {
      const persisted = sanitizePersistedTracks(JSON.parse(raw) as unknown);
      if (persisted.length === 0) return;
      const tracks = await Promise.all(
        persisted.map(async (track): Promise<MusicTrack> => ({
          ...track,
          src: (await toFileSrc(track.path)) ?? '',
        })),
      );
      // A scan may have completed while the sources were being derived;
      // only apply the snapshot when nothing landed in the meantime.
      if (changedSinceBoot) return;
      store.set(tracks);
    } catch {
      // Malformed persisted blob: the session starts from scan results only.
    }
  })();
}

/* ---------- Scanning & enrichment ---------- */

/** Parallel metadata reads; modest pool so disk/IPC stays responsive. */
const ENRICH_CONCURRENCY = 6;

function isKnownTagNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * One audio file → `MusicTrack`, applying the documented fallbacks:
 * title from tag else filename, artist/albumArtist else `'Unknown Artist'`,
 * album from tag else the containing folder name, tag numbers/genre else
 * null, duration from the metadata reader else 0.
 */
async function enrichAudioFile(file: ScannedFile): Promise<MusicTrack | null> {
  if (!isAudioFile(file.path) && !isAudioFile(file.name)) return null;

  const metadata = await readAudioMetadata(file.path);
  const artist = asString(metadata?.artist) ?? UNKNOWN_ARTIST;
  const albumArtist = asString(metadata?.albumArtist) ?? artist;
  const album = asString(metadata?.album) ?? folderLabelFor(file.path);
  const src = (await toFileSrc(file.path)) ?? '';

  const tagYear = asNullableNumber(metadata?.year);
  const tagTrackNumber = asNullableNumber(metadata?.trackNumber);
  const tagDiscNumber = asNullableNumber(metadata?.discNumber);
  const tagDuration = asNullableNumber(metadata?.durationSeconds);

  return {
    id: file.path,
    path: file.path,
    src,
    title: asString(metadata?.title) ?? titleFromFilename(file.name),
    artist,
    albumArtist,
    album,
    year: isKnownTagNumber(tagYear) ? tagYear : null,
    trackNumber: isKnownTagNumber(tagTrackNumber) ? tagTrackNumber : null,
    discNumber: isKnownTagNumber(tagDiscNumber) ? tagDiscNumber : null,
    genre: asString(metadata?.genre),
    durationSeconds: tagDuration !== null && tagDuration > 0 ? tagDuration : 0,
    hasCover: metadata?.hasCover === true,
  };
}

/** Enrich files through a small worker pool, preserving input order. */
async function enrichAudioFiles(files: ScannedFile[]): Promise<MusicTrack[]> {
  const results = new Array<MusicTrack | null>(files.length).fill(null);
  let cursor = 0;

  const workerCount = Math.min(ENRICH_CONCURRENCY, files.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < files.length) {
      const index = cursor++;
      try {
        results[index] = await enrichAudioFile(files[index]);
      } catch (e) {
        console.warn(`Metadata read failed for ${files[index].path}:`, e);
        results[index] = null;
      }
    }
  });

  await Promise.all(workers);
  return results.filter((track): track is MusicTrack => track !== null);
}

/**
 * Scan one configured music root and replace its previous results. Mirrors
 * the video library's `scanSingleRoot` (same command, same argument names,
 * same per-root replacement semantics).
 */
function scanSingleMusicRoot(rootPath: string, includeHidden: boolean): void {
  void invokeCommand<ScanResult>('scan_library_dir', { root: rootPath, maxDepth: 4, includeHidden })
    .then(async (scanResult) => {
      if (!scanResult) return;

      const audioFiles = scanResult.files.filter(
        (file) => isAudioFile(file.path) || isAudioFile(file.name),
      );
      const tracks = await enrichAudioFiles(audioFiles);

      replaceTracksForRoot(rootPath, tracks);
    })
    .catch((e) => {
      console.warn(`Music scan failed for ${rootPath}:`, e);
    });
}

/**
 * Scan all configured music roots. Skipped when startup scanning is
 * disabled, mirroring the video library's `scanRoots` behaviour.
 */
function scanMusicRoots(): void {
  const state = get(settings);
  if (state.scanOnStartup === false) return;

  for (const rootPath of state.musicLibraryFolders) {
    scanSingleMusicRoot(rootPath, state.includeHiddenFiles);
  }
}

/* ---------- Settings watch (mirrors library.ts bootstrap + reactive scan) ---------- */

let bootstrapRan = false;
let lastScannedFolders = '';

settings.subscribe((newSettings) => {
  if (!hasTauri()) return;

  if (!bootstrapRan) {
    bootstrapRan = true;

    // Wait for settings hydration (and the asset-scope sync it performs for
    // the combined video + music roots) before the first scan touches
    // asset:// paths, exactly like the video library bootstrap.
    void settingsHydrated.then(() => {
      lastScannedFolders = get(settings).musicLibraryFolders.join('\0');
      pruneRemovedRoots(get(settings).musicLibraryFolders);
      scanMusicRoots();
    });
    return;
  }

  const foldersKey = newSettings.musicLibraryFolders.join('\0');
  if (foldersKey !== lastScannedFolders) {
    lastScannedFolders = foldersKey;
    pruneRemovedRoots(newSettings.musicLibraryFolders);
    scanMusicRoots();
  }
});

/**
 * Rescan a single configured music root on demand (folder context menu).
 * Explicit rescans ignore the scanOnStartup preference because the user asked
 * for them; the call is a no-op outside the desktop shell. Mirrors the video
 * library's `rescanLibraryRoot` and replaces only that root's slice.
 */
export function rescanMusicRoot(rootPath: string): void {
  if (!hasTauri()) return;
  scanSingleMusicRoot(rootPath, get(settings).includeHiddenFiles);
}

/* ---------- Grouping ---------- */

export interface MusicArtistGroup {
  /** Display name (album artist, falling back to artist). */
  name: string;
  albumCount: number;
  trackCount: number;
}

export interface MusicAlbumGroup {
  /** Display album title (tag, or the containing folder name). */
  title: string;
  year: number | null;
  trackCount: number;
}

/**
 * Artists grouped by album artist (falling back to artist), alphabetical
 * with the `'Unknown Artist'` bucket last.
 */
export const musicArtists: Readable<MusicArtistGroup[]> = derived(musicTracks, ($tracks) => {
  const groups = new Map<string, { name: string; albums: Set<string>; tracks: number }>();

  for (const track of $tracks) {
    const name = track.albumArtist || track.artist || UNKNOWN_ARTIST;
    const key = name.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { name, albums: new Set(), tracks: 0 };
      groups.set(key, group);
    }
    group.albums.add(track.album.toLowerCase());
    group.tracks += 1;
  }

  return Array.from(groups.values())
    .map((group) => ({
      name: group.name,
      albumCount: group.albums.size,
      trackCount: group.tracks,
    }))
    .sort((a, b) => {
      const aUnknown = a.name === UNKNOWN_ARTIST;
      const bUnknown = b.name === UNKNOWN_ARTIST;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return compareText(a.name, b.name);
    });
});

/**
 * Albums for one artist (matched on the album-artist/artist display name the
 * `musicArtists` level shows), grouped by the album fallback chain, sorted by
 * year (unknown years last), then title.
 */
export function albumsForArtist(artistName: string): Readable<MusicAlbumGroup[]> {
  return derived(musicTracks, ($tracks) => {
    const key = artistName.toLowerCase();
    const groups = new Map<string, MusicAlbumGroup>();

    for (const track of $tracks) {
      const artist = track.albumArtist || track.artist || UNKNOWN_ARTIST;
      if (artist.toLowerCase() !== key) continue;
      const albumKey = track.album.toLowerCase();
      const group = groups.get(albumKey);
      if (group) {
        group.trackCount += 1;
        if (group.year === null) group.year = track.year;
      } else {
        groups.set(albumKey, { title: track.album, year: track.year, trackCount: 1 });
      }
    }

    return Array.from(groups.values()).sort((a, b) => {
      if ((a.year ?? null) !== (b.year ?? null)) {
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return a.year - b.year;
      }
      return compareText(a.title, b.title);
    });
  });
}

/** Album playback order: discNumber → trackNumber → title. */
export function compareAlbumOrder(a: MusicTrack, b: MusicTrack): number {
  const discA = a.discNumber ?? 1;
  const discB = b.discNumber ?? 1;
  if (discA !== discB) return discA - discB;

  const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
  if (trackA !== trackB) return trackA - trackB;

  return compareText(a.title, b.title);
}

/**
 * Tracks of one album for one artist, in disc/track/title order.
 * Artist and album must match the names displayed on the artists and album
 * levels (case-insensitive).
 */
export function tracksForAlbum(artistName: string, albumName: string): Readable<MusicTrack[]> {
  return derived(musicTracks, ($tracks) => {
    const artistKey = artistName.toLowerCase();
    const albumKey = albumName.toLowerCase();
    return $tracks
      .filter(
        (track) =>
          (track.albumArtist || track.artist).toLowerCase() === artistKey &&
          track.album.toLowerCase() === albumKey,
      )
      .sort(compareAlbumOrder);
  });
}

export interface MusicGenreGroup {
  name: string;
  trackCount: number;
}

/** Genres from tags, alphabetical, with the `'Unknown Genre'` bucket last. */
export const musicGenres: Readable<MusicGenreGroup[]> = derived(musicTracks, ($tracks) => {
  const counts = new Map<string, MusicGenreGroup>();

  for (const track of $tracks) {
    const name = track.genre ?? UNKNOWN_GENRE;
    const key = name.toLowerCase();
    const group = counts.get(key);
    if (group) group.trackCount += 1;
    else counts.set(key, { name, trackCount: 1 });
  }

  return Array.from(counts.values()).sort((a, b) => {
    const aUnknown = a.name === UNKNOWN_GENRE;
    const bUnknown = b.name === UNKNOWN_GENRE;
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    return compareText(a.name, b.name);
  });
});

/* ---------- Covers ---------- */

const coverStore = writable<Map<string, string>>(new Map());

/** Read-only view: track id → object URL of the embedded cover. */
export const musicCovers: Readable<Map<string, string>> = { subscribe: coverStore.subscribe };

const pendingCovers = new Set<string>();
const failedCovers = new Set<string>();
const coverUrls = new Map<string, string>();
let coverInflight = 0;
const coverQueue: MusicTrack[] = [];

/** Cover pool depth; covers are small, but keep disk traffic bounded. */
const COVER_CONCURRENCY = 4;

function isPngBytes(raw: Uint8Array): boolean {
  return raw.length > 8 && raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47;
}

/** Cover bytes → object URL (magic-byte sniffed JPEG/PNG mime). */
function coverBytesToUrl(bytes: number[] | Uint8Array): string {
  const raw = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const type = isPngBytes(raw) ? 'image/png' : 'image/jpeg';
  // Copy the bytes into a fresh ArrayBuffer so the BlobPart typing never
  // has to reason about SharedArrayBuffer-backed views.
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type }));
}

/** `cover_get`: the Rust-side persisted extraction for this path. */
async function readCoverFromRust(path: string): Promise<string | null> {
  const bytes = await coverGet(path);
  return bytes && bytes.length > 0 ? coverBytesToUrl(bytes) : null;
}

/** `cover_extract`: re-embed artwork into the Rust cover table. */
async function extractCoverInRust(path: string): Promise<string | null> {
  const bytes = await coverExtract(path);
  return bytes && bytes.length > 0 ? coverBytesToUrl(bytes) : null;
}

function commitCovers(): void {
  coverStore.set(new Map(coverUrls));
}

function pumpCovers(): void {
  while (coverInflight < COVER_CONCURRENCY && coverQueue.length > 0) {
    const track = coverQueue.shift();
    if (!track) continue;

    coverInflight += 1;
    void (async () => {
      let url: string | null = null;
      try {
        url = await readCoverFromRust(track.path);
        if (!url) url = await extractCoverInRust(track.path);
      } catch (e) {
        console.warn(`Cover lookup failed for ${track.path}:`, e);
      }

      coverInflight -= 1;
      pendingCovers.delete(track.id);
      if (url) {
        coverUrls.set(track.id, url);
      } else {
        failedCovers.add(track.id);
      }
      commitCovers();
      pumpCovers();
    })();
  }
}

/**
 * Lazily resolve the embedded cover for `track` into `musicCovers`
 * (no-op when already resolved, in flight, previously failed this session,
 * or the metadata reader reported no artwork). Called by the UI when a
 * track/album row mounts; Phase 4 consumers.
 */
export function ensureMusicCover(track: MusicTrack): void {
  const id = track.id;
  if (coverUrls.has(id) || pendingCovers.has(id) || failedCovers.has(id)) return;
  if (!hasTauri()) return;
  if (!track.hasCover) return;

  pendingCovers.add(id);
  coverQueue.push(track);
  pumpCovers();
}

/** Revoke every cached object URL; the cache refills lazily on demand. */
export function clearMusicCoverCache(): void {
  pendingCovers.clear();
  coverQueue.length = 0;
  for (const url of coverUrls.values()) URL.revokeObjectURL(url);
  coverUrls.clear();
  failedCovers.clear();
  commitCovers();
}

/* ---------- Playback helpers ---------- */

/** Music library track → player queue track (`albumArtist` shown as artist). */
export function toPlayerTrack(track: MusicTrack): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.albumArtist || track.artist,
    duration: track.durationSeconds,
    src: track.src,
  };
}

/**
 * Record a listen for `track` in the shared history store (`type: 'music'`),
 * keyed by the absolute file path so Recent view can resume/re-render it.
 * `positionSeconds` defaults to the full duration (a completed play).
 */
export function recordMusicListen(
  track: MusicTrack,
  positionSeconds: number = track.durationSeconds,
): HistoryEntry | null {
  return recordHistory({
    mediaKey: track.path,
    type: 'music',
    title: track.title,
    artist: track.albumArtist || track.artist,
    src: track.src,
    duration: track.durationSeconds,
    position: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0,
  });
}
