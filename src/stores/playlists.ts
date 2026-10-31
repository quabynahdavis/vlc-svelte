import { writable, type Writable } from 'svelte/store';
import { playlists as mockPlaylists, type Playlist, type PlaylistTrack } from '../lib/mock';

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

/** Bump the version suffix when the persisted shape changes. */
export const PLAYLIST_PINS_STORAGE_KEY = 'vlc.playlists.pins.v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(PLAYLIST_PINS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizePinnedIds(JSON.parse(raw) as unknown);
  } catch {
    // Malformed JSON or blocked storage: start with no pins.
    return [];
  }
}

function persistPinnedIds(ids: string[]): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(PLAYLIST_PINS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Quota exceeded, private mode, or blocked storage: keep pins in memory.
  }
}

function createPinnedPlaylistStore(): Writable<string[]> {
  const store = writable<string[]>(loadPinnedIds());

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
