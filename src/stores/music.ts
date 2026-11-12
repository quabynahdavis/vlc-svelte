import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

export const musicBreadcrumb = writable<string[]>(['Music', 'Artists']);
export const selectedArtistId = writable<string | null>(null);
export const selectedAlbumId = writable<string | null>(null);
export const selectedGenre = writable<string | null>(null);
export const musicSearch = writable('');

/** Top-level browse levels available in the Music view. */
export type MusicBrowseMode = 'songs' | 'albums' | 'artists' | 'genres' | 'folders';

/** Artists is the default so the existing artist-first browsing is preserved. */
export const musicBrowseMode = writable<MusicBrowseMode>('artists');

/**
 * Folders tab: breadcrumb segments below the active music root. Segment 0 is
 * always the root's base name; the absolute root identity lives in
 * `musicFolderRootPath` so duplicate-named roots never merge their subtrees
 * (same pattern as the video library's `activeLibraryRootPath`).
 */
export const musicFolderSegments: Writable<string[]> = writable([]);

/** Absolute path of the configured music root the Folders tab is inside; `null` at the folder-root level. */
export const musicFolderRootPath: Writable<string | null> = writable(null);

/** Sort columns shared by the artists, albums and tracks levels. */
export type MusicSortKey = 'title' | 'artist' | 'album' | 'duration' | 'year';
export type SortDirection = 'asc' | 'desc';

export const musicSort = writable<MusicSortKey>('title');
export const musicSortDirection = writable<SortDirection>('asc');
