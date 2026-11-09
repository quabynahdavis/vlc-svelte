import { writable, type Writable } from 'svelte/store';
import { playlists as mockPlaylists, type Playlist, type PlaylistTrack } from '../lib/mock';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { hasTauri } from '../lib/tauriFs';

export const playlistsSelectedId = writable<string | null>(null);
export const playlistsSearch = writable('');
/** Playlist list ordering. `manual` keeps the source order. */
export type PlaylistsSortKey = 'manual' | 'name' | 'date' | 'count';
export type SortDirection = 'asc' | 'desc';

export const playlistsSort = writable<PlaylistsSortKey>('manual');
export const playlistsSortDirection = writable<SortDirection>('asc');

/**
 * Writable playlist collection seeded from the demo data.
 *
 * User-created playlists live only for the current session: their tracks point
 * at `blob:` object URLs, which are meaningless after a reload. Never persist
 * this store (or the object URLs it can contain).
 */
export const playlistsData: Writable<Playlist[]> = writable(
  mockPlaylists.map((playlist) => ({ ...playlist, tracks: [...playlist.tracks] })),
);

function createPlaylistId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `playlist-${crypto.randomUUID()}`;
  }
  return `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function trackFromPayload(track: PlaylistTrack): PlaylistTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
    source: track.source,
  };
}

/**
 * Append a track to an existing playlist. Returns false when the playlist no
 * longer exists or the exact source is already part of it.
 */
export function addTrackToPlaylist(playlistId: string, track: PlaylistTrack): boolean {
  let added = false;

  playlistsData.update((items) =>
    items.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;

      const duplicate = playlist.tracks.some(
        (entry) => entry.id === track.id && entry.source === track.source,
      );
      if (duplicate) return playlist;

      const nextTrack = trackFromPayload(track);
      added = true;

      return {
        ...playlist,
        tracks: [...playlist.tracks, nextTrack],
        trackCount: playlist.tracks.length + 1,
        totalDurationSeconds: playlist.totalDurationSeconds + nextTrack.durationSeconds,
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
        trackCount: tracks.length,
        // Reordering cannot change the total runtime.
        totalDurationSeconds: playlist.totalDurationSeconds,
        lastModified: Date.now(),
      };

      result = updated;
      return updated;
    }),
  );

  return result;
}

/** Create a session-only playlist that starts with the supplied track. */
export function createPlaylistWithTrack(name: string, track: PlaylistTrack): Playlist {
  const entry = trackFromPayload(track);
  const playlist: Playlist = {
    id: createPlaylistId(),
    name: name.trim(),
    trackCount: 1,
    totalDurationSeconds: entry.durationSeconds,
    lastModified: Date.now(),
    tracks: [entry],
  };

  playlistsData.update((items) => [playlist, ...items]);
  return playlist;
}

/** Create a session-only playlist from an array of tracks. */
export function createPlaylistFromTracks(name: string, tracks: PlaylistTrack[]): Playlist {
  const entries = tracks.map(trackFromPayload);
  const totalDurationSeconds = entries.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  const playlist: Playlist = {
    id: createPlaylistId(),
    name: name.trim(),
    trackCount: entries.length,
    totalDurationSeconds,
    lastModified: Date.now(),
    tracks: entries,
  };

  playlistsData.update((items) => [playlist, ...items]);
  return playlist;
}

/** Bump the version suffix when the persisted shape changes. */
export const PLAYLIST_PINS_STORAGE_KEY = 'vlc.playlists.pins.v1';

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
 * Unknown ids are harmless (session-only playlists disappear after reload).
 */
export const pinnedPlaylistIds: Writable<string[]> = createPinnedPlaylistStore();
