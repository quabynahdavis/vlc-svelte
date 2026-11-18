import { writable, type Writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { hasTauri } from '../lib/tauriFs';

export const playlistsSelectedId = writable<string | null>(null);
export const playlistsSearch = writable('');
/** Playlist list ordering. `manual` keeps the source order. */
export type PlaylistsSortKey = 'manual' | 'name' | 'date' | 'count';
export type SortDirection = 'asc' | 'desc';

export const playlistsSort = writable<PlaylistsSortKey>('manual');
export const playlistsSortDirection = writable<SortDirection>('asc');

/** A track saved on a playlist. `src` is what the player queues. */
export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  /** Duration in seconds. */
  duration: number;
  /**
   * Playable source. `blob:` object URLs work for the current session and are
   * omitted when the playlist is written to disk.
   */
  src: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  totalDurationSeconds: number;
  lastModified: number;
  tracks: PlaylistTrack[];
}

const MAX_PLAYLISTS = 200;
const MAX_TRACKS = 1000;
const MAX_NAME = 80;
const MAX_TEXT = 300;
const MAX_SRC = 8000;

/** Bump the version suffix when the persisted shape changes. */
export const PLAYLISTS_STORAGE_KEY = 'vlc.playlists.v1';
/** Bump the version suffix when the persisted shape changes. */
export const PLAYLIST_PINS_STORAGE_KEY = 'vlc.playlists.pins.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** `blob:` URLs die with the document; everything else can be queued after reload. */
export function isDurablePlaylistSrc(src: string): boolean {
  return src.length > 0 && !src.startsWith('blob:');
}

function sanitizeTrack(value: unknown): PlaylistTrack | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id, MAX_TEXT);
  const title = cleanString(value.title, MAX_TEXT);
  if (!id || !title) return null;

  const src = cleanString(value.src ?? value.source, MAX_SRC);
  if (!src) return null;

  const duration = cleanDuration(
    typeof value.duration === 'number' ? value.duration : value.durationSeconds,
  );

  return {
    id,
    title,
    artist: cleanString(value.artist, MAX_TEXT),
    duration,
    src,
  };
}

function sanitizePlaylist(value: unknown): Playlist | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id, MAX_TEXT);
  const name = cleanString(value.name, MAX_NAME);
  if (!id || !name) return null;

  const tracksRaw = Array.isArray(value.tracks) ? value.tracks : [];
  const seen = new Set<string>();
  const tracks: PlaylistTrack[] = [];

  for (const entry of tracksRaw) {
    if (tracks.length >= MAX_TRACKS) break;
    const track = sanitizeTrack(entry);
    if (!track) continue;
    const key = `${track.id}\0${track.src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push(track);
  }

  const lastModified =
    typeof value.lastModified === 'number' && Number.isFinite(value.lastModified)
      ? value.lastModified
      : Date.now();

  return {
    id,
    name,
    trackCount: tracks.length,
    totalDurationSeconds: tracks.reduce((sum, track) => sum + track.duration, 0),
    lastModified,
    tracks,
  };
}

/** Stored playlists are untrusted: drop malformed rows and recompute totals. */
export function sanitizePlaylists(value: unknown): Playlist[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const playlists: Playlist[] = [];

  for (const entry of value) {
    if (playlists.length >= MAX_PLAYLISTS) break;
    const playlist = sanitizePlaylist(entry);
    if (!playlist || seen.has(playlist.id)) continue;
    seen.add(playlist.id);
    playlists.push(playlist);
  }

  return playlists;
}

/**
 * Disk shape. Blob-backed tracks stay in memory for this session and are left
 * out here so a reload does not resurrect a dead object URL.
 */
function serializePlaylists(items: Playlist[]): Array<{
  id: string;
  name: string;
  lastModified: number;
  tracks: Array<{ id: string; title: string; artist: string; duration: number; src: string }>;
}> {
  return items.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    lastModified: playlist.lastModified,
    tracks: playlist.tracks
      .filter((track) => isDurablePlaylistSrc(track.src))
      .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        src: track.src,
      })),
  }));
}

function loadPlaylists(): Playlist[] {
  // Desktop shell: start empty; the snapshot is applied by the boot hydration.
  if (hasTauri()) return [];

  try {
    const raw = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizePlaylists(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

const writePlaylists = createKeyWriter(PLAYLISTS_STORAGE_KEY);

function createPlaylistsStore(): Writable<Playlist[]> {
  const store = writable<Playlist[]>(loadPlaylists());

  /** Set when a mutation lands before the SQLite snapshot has been applied. */
  let changedSinceBoot = false;

  function persistPlaylists(items: Playlist[]): void {
    changedSinceBoot = true;
    void writePlaylists(JSON.stringify(serializePlaylists(items)));
  }

  void (async () => {
    const raw = await loadPersistedRaw(PLAYLISTS_STORAGE_KEY);
    if (raw === null || changedSinceBoot) return;
    try {
      store.set(sanitizePlaylists(JSON.parse(raw) as unknown));
    } catch {
      // Malformed legacy blob: start with no playlists.
    }
  })();

  return {
    subscribe: store.subscribe,
    set(value) {
      const next = sanitizePlaylists(value);
      store.set(next);
      persistPlaylists(next);
    },
    update(updater) {
      store.update((current) => {
        const next = sanitizePlaylists(updater(current));
        persistPlaylists(next);
        return next;
      });
    },
  };
}

/**
 * User playlists, persisted under `vlc.playlists.v1`.
 * A fresh install has none. Tracks keep id, title, artist, duration and src.
 */
export const playlistsData: Writable<Playlist[]> = createPlaylistsStore();

function createPlaylistId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `playlist-${crypto.randomUUID()}`;
  }
  return `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function trackFromPayload(track: PlaylistTrack): PlaylistTrack | null {
  return sanitizeTrack(track);
}

function totals(tracks: PlaylistTrack[]): { trackCount: number; totalDurationSeconds: number } {
  return {
    trackCount: tracks.length,
    totalDurationSeconds: tracks.reduce((sum, track) => sum + track.duration, 0),
  };
}

/**
 * Append a track to an existing playlist. Returns false when the playlist no
 * longer exists, the track is incomplete, or the exact source is already in it.
 */
export function addTrackToPlaylist(playlistId: string, track: PlaylistTrack): boolean {
  const nextTrack = trackFromPayload(track);
  if (!nextTrack) return false;

  let added = false;

  playlistsData.update((items) =>
    items.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;

      const duplicate = playlist.tracks.some(
        (entry) => entry.id === nextTrack.id && entry.src === nextTrack.src,
      );
      if (duplicate) return playlist;

      added = true;
      const tracks = [...playlist.tracks, nextTrack];

      return {
        ...playlist,
        tracks,
        ...totals(tracks),
        lastModified: Date.now(),
      };
    }),
  );

  return added;
}

/**
 * Move a track inside a playlist.
 *
 * `toIndex` is the final index in the reordered array, after the track has been
 * removed from its old slot. Returns the updated playlist, or `null` when the
 * playlist does not exist. Invalid indexes and no-op moves leave the store
 * untouched.
 */
export function movePlaylistTrack(
  playlistId: string,
  fromIndex: number,
  toIndex: number,
): Playlist | null {
  let result: Playlist | null = null;

  playlistsData.update((items) =>
    items.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;

      result = playlist;

      const count = playlist.tracks.length;
      if (
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex < 0 ||
        fromIndex >= count ||
        toIndex < 0 ||
        toIndex >= count ||
        fromIndex === toIndex
      ) {
        return playlist;
      }

      const tracks = [...playlist.tracks];
      const [moved] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, moved);

      const updated: Playlist = {
        ...playlist,
        tracks,
        ...totals(tracks),
        lastModified: Date.now(),
      };

      result = updated;
      return updated;
    }),
  );

  return result;
}

/** Create a playlist that starts with the supplied track. */
export function createPlaylistWithTrack(name: string, track: PlaylistTrack): Playlist | null {
  const entry = trackFromPayload(track);
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!entry || !trimmed) return null;

  const playlist: Playlist = {
    id: createPlaylistId(),
    name: trimmed,
    ...totals([entry]),
    lastModified: Date.now(),
    tracks: [entry],
  };

  playlistsData.update((items) => [playlist, ...items]);
  return playlist;
}

/** Create a playlist from an array of tracks. Empty lists are allowed. */
export function createPlaylistFromTracks(name: string, tracks: PlaylistTrack[]): Playlist | null {
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!trimmed) return null;

  const entries = tracks
    .map((track) => trackFromPayload(track))
    .filter((track): track is PlaylistTrack => track !== null);
  const playlist: Playlist = {
    id: createPlaylistId(),
    name: trimmed,
    ...totals(entries),
    lastModified: Date.now(),
    tracks: entries,
  };

  playlistsData.update((items) => [playlist, ...items]);
  return playlist;
}

/** Remove a playlist. Callers should also drop its pin. */
export function deletePlaylist(playlistId: string): void {
  playlistsData.update((items) => items.filter((playlist) => playlist.id !== playlistId));
  pinnedPlaylistIds.update((ids) => ids.filter((id) => id !== playlistId));
}

export type PlaylistRenameError = 'empty' | 'duplicate' | 'missing';

function playlistNamesMatch(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;
}

/**
 * Rename a playlist and persist it through `vlc.playlists.v1`.
 * Empty names and names that match another playlist are rejected. The same
 * playlist may keep its current name, including a case-only change.
 */
export function renamePlaylist(playlistId: string, name: string): PlaylistRenameError | null {
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!trimmed) return 'empty';

  let error: PlaylistRenameError | null = null;

  playlistsData.update((items) => {
    const index = items.findIndex((playlist) => playlist.id === playlistId);
    const current = index >= 0 ? items[index] : undefined;
    if (!current) {
      error = 'missing';
      return items;
    }

    const duplicate = items.some(
      (playlist) => playlist.id !== playlistId && playlistNamesMatch(playlist.name, trimmed),
    );
    if (duplicate) {
      error = 'duplicate';
      return items;
    }

    if (current.name === trimmed) return items;

    const next = items.slice();
    next[index] = {
      ...current,
      name: trimmed,
      lastModified: Date.now(),
    };
    return next;
  });

  return error;
}

/** Stored pins are untrusted: keep only unique, non-empty string ids. */
function sanitizePinnedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const id = candidate.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function loadPinnedIds(): string[] {
  // Desktop shell: start with no pins; the snapshot is applied by the boot
  // hydration. Browser preview keeps the direct localStorage read.
  if (hasTauri()) return [];

  try {
    const raw = window.localStorage.getItem(PLAYLIST_PINS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizePinnedIds(JSON.parse(raw) as unknown);
  } catch {
    // Malformed JSON or blocked storage: start with no pins.
    return [];
  }
}

const writePinnedIds = createKeyWriter(PLAYLIST_PINS_STORAGE_KEY);

function createPinnedPlaylistStore(): Writable<string[]> {
  const store = writable<string[]>(loadPinnedIds());

  /** Set when a mutation lands before the SQLite snapshot has been applied. */
  let changedSinceBoot = false;

  function persistPinnedIds(ids: string[]): void {
    changedSinceBoot = true;
    void writePinnedIds(JSON.stringify(ids));
  }

  // Desktop hydration: apply the persisted snapshot only when no mutation
  // landed while reading.
  void (async () => {
    const raw = await loadPersistedRaw(PLAYLIST_PINS_STORAGE_KEY);
    if (raw === null || changedSinceBoot) return;
    try {
      store.set(sanitizePinnedIds(JSON.parse(raw) as unknown));
    } catch {
      // Malformed legacy blob: start with no pins.
    }
  })();

  return {
    subscribe: store.subscribe,
    set(value) {
      const ids = sanitizePinnedIds(value);
      store.set(ids);
      persistPinnedIds(ids);
    },
    update(updater) {
      store.update((current) => {
        const ids = sanitizePinnedIds(updater(current));
        persistPinnedIds(ids);
        return ids;
      });
    },
  };
}

/**
 * Ids of pinned playlists, persisted under `vlc.playlists.pins.v1`.
 * Unknown ids are harmless and are removed when that playlist is deleted.
 */
export const pinnedPlaylistIds: Writable<string[]> = createPinnedPlaylistStore();
